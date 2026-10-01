import { waitForUser } from "./auth.js";
import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CLOUD_SYNC_EXACT_KEYS as EXACT_KEYS, CLOUD_SYNC_PREFIXES as KEY_PREFIXES } from "./accountStorage.js";

// Plans the coach can see through sharedPlans (js/coachAccess.js).
const MIRRORED_KEYS = ["training-programs","running-programs","coach-plans"];
const META_KEY = "__cloudSyncMeta";
const SNAPSHOT_KEY = "__cloudSyncSnapshot";
const TIMES_KEY = "__cloudSyncKeyTimes";
// This device's copy of the cloud's version, and when the whole doc was
// last read. Device-only: never synced.
const VERSION_KEY = "__cloudSyncVersion";
const FULL_PULL_KEY = "__cloudSyncFullPullAt";
// Read the whole doc at least this often even when the version matches
// (a device still on an older app version pushes without a version).
const FULL_PULL_EVERY = 6 * 3600 * 1000;

function saveSyncMeta(meta){ try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){} }
export function getSyncStatus(){ try{ return JSON.parse(localStorage.getItem(META_KEY)||"null")||{lastSyncedAt:null,lastError:null}; }catch(e){ return {lastSyncedAt:null,lastError:null}; } }
function getKeyTimes(){ try{ return JSON.parse(localStorage.getItem(TIMES_KEY)||"{}")||{}; }catch(e){ return {}; } }
function saveKeyTimes(times){ try{ localStorage.setItem(TIMES_KEY, JSON.stringify(times)); }catch(e){} }
function collectLocalKeys(){
  const keys=new Set(EXACT_KEYS.filter(k=>localStorage.getItem(k)!==null));
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&KEY_PREFIXES.some(p=>key.startsWith(p))) keys.add(key);
  }
  return [...keys];
}
function currentLocalData(){ const data={}; for(const k of collectLocalKeys()) data[k]=localStorage.getItem(k); return data; }
const isOffline=()=>typeof navigator!=="undefined" && navigator.onLine===false;

/**
 * Bundles every Southbound localStorage key this app actually knows
 * about (the same list cloud sync itself uses, so this can never
 * drift out of sync with what actually gets backed up) into one
 * plain object suitable for downloading as a backup file.
 */
export function exportAllData(){
  return {
    app: "EddieOS",
    exportedAt: new Date().toISOString(),
    data: currentLocalData()
  };
}

// The last-synced copy, parsed once per page and kept in memory: the
// 30-second check compares against it without re-reading or re-parsing
// the (large) stored snapshot.
let syncedCache;
function lastSyncedData(){
  if(syncedCache!==undefined) return syncedCache;
  try{ const raw=localStorage.getItem(SNAPSHOT_KEY); syncedCache=raw===null?null:(JSON.parse(raw)||{}); }catch(e){ syncedCache=null; }
  return syncedCache;
}
function sameData(a,b){
  if(!a||!b) return false;
  const ka=Object.keys(a), kb=Object.keys(b);
  if(ka.length!==kb.length) return false;
  for(const k of ka) if(a[k]!==b[k]) return false;
  return true;
}
function markSynced(data=currentLocalData()){
  if(sameData(lastSyncedData(),data)) return;
  syncedCache={...data};
  try{ localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(data)); }catch(e){}
}
function changedLocalKeys(data){
  const prev=lastSyncedData();
  if(prev===null) return [];
  const changed=[];
  const keys=new Set([...Object.keys(prev),...Object.keys(data)]);
  for(const k of keys) if((prev[k]??null)!==(data[k]??null)) changed.push(k);
  return changed;
}
// True when a synced key changed here since the last sync (or this
// device has never synced).
export function hasLocalChanges(){
  if(lastSyncedData()===null) return true;
  return changedLocalKeys(currentLocalData()).length>0;
}
function stampChangedKeys(data){
  const times=getKeyTimes();
  const now=Date.now();
  for(const k of changedLocalKeys(data)) times[k]=now;
  saveKeyTimes(times);
  return times;
}
function legacyTimestamp(value){
  try{ return Number(value?.toMillis?.()||0); }catch(e){ return 0; }
}
async function syncDocs(){
  const user=await waitForUser();
  return user?{ data:doc(db,"users",user.uid,"sync","localStorage"), meta:doc(db,"users",user.uid,"sync","meta") }:null;
}

// ---- Status for the page ----
let currentState=null;
function emit(state){
  currentState=state;
  try{
    window.dispatchEvent(new CustomEvent("sb:sync-status",{ detail:{ state, pending:hasLocalChanges(), lastSyncedAt:getSyncStatus().lastSyncedAt } }));
  }catch(e){}
}
export function currentSyncState(){ return currentState; }

// Returns {ok, applied} rather than a bare boolean so a caller can
// tell whether the pull actually changed anything locally (applied >
// 0) versus this device already being current -- used to decide
// whether a fresh page load needs to reload itself to show newly
// pulled data.
export async function pullFromCloud({ force=false }={}){
  try{
    const refs=await syncDocs();
    if(!refs){ saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:"not-signed-in"}); return {ok:false,applied:0}; }
    if(isOffline()){ emit("offline"); return {ok:false,applied:0,offline:true}; }
    emit("syncing");
    // Nothing new in the cloud since this device last read it: skip the big read.
    let cloudVersion=null;
    try{
      const metaSnap=await getDoc(refs.meta);
      if(metaSnap.metadata?.fromCache){ emit("offline"); return {ok:false,applied:0,offline:true}; }
      cloudVersion=metaSnap.exists()?(metaSnap.data().v||null):null;
    }catch(e){ cloudVersion=null; }
    const fullAt=Number(localStorage.getItem(FULL_PULL_KEY)||0);
    if(!force && cloudVersion && cloudVersion===localStorage.getItem(VERSION_KEY) && Date.now()-fullAt<FULL_PULL_EVERY){
      saveSyncMeta({lastSyncedAt:Date.now(),lastError:null});
      emit(hasLocalChanges()?"pending":"synced");
      return {ok:true,applied:0,skipped:true};
    }
    const snap=await getDoc(refs.data);
    if(snap.metadata?.fromCache){ emit("offline"); return {ok:false,applied:0,offline:true}; }
    if(!snap.exists()){ markSynced(); saveSyncMeta({lastSyncedAt:Date.now(),lastError:null}); emit("synced"); return {ok:false,applied:0}; }
    const cloud=snap.data()||{};
    const stored=cloud.data||{};
    const cloudTimes=cloud.keyUpdatedAt||{};
    const localTimes=getKeyTimes();
    const legacy=legacyTimestamp(cloud.updatedAt);
    // What this device last synced: anything that differs from it now was
    // changed here and not pushed yet (keys are only timestamped on push).
    // That copy is the newer one: keep it and push it, never overwrite it
    // with the cloud's older copy (which reloaded pages that save as they
    // go, like the COROS history filling in, over and over -- 2026-09-27).
    const synced=lastSyncedData();
    let applied=0;
    for(const key of Object.keys(stored)){
      const ct=Number(cloudTimes[key]||legacy||0);
      const lt=Number(localTimes[key]||0);
      if(lt>ct) continue;
      const local=localStorage.getItem(key);
      if(synced!==null && local!==null && local!==(synced[key]??null)){ localTimes[key]=Date.now(); continue; }
      if(ct>0) localTimes[key]=ct;
      if(local===stored[key]) continue;
      localStorage.setItem(key,stored[key]);
      applied++;
    }
    try{
      const {pullSharedPlanUpdates}=await import("./coachAccess.js");
      applied+=await pullSharedPlanUpdates(localTimes);
    }catch(error){ console.warn("Coach-shared plan pull failed:",error); }
    saveKeyTimes(localTimes);
    markSynced();
    // Accounts from before the version doc get one now, so the next page
    // load can skip the big read.
    if(!cloudVersion){
      cloudVersion=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      try{ await setDoc(refs.meta,{v:cloudVersion,updatedAt:serverTimestamp()}); }catch(e){ cloudVersion=null; }
    }
    try{
      if(cloudVersion) localStorage.setItem(VERSION_KEY,cloudVersion);
      localStorage.setItem(FULL_PULL_KEY,String(Date.now()));
    }catch(e){}
    saveSyncMeta({lastSyncedAt:Date.now(),lastError:null});
    emit(hasLocalChanges()?"pending":"synced");
    if(applied) console.log(`☁️ Pulled ${applied} item(s) from the cloud.`);
    return {ok:true,applied};
  }catch(error){
    saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:error.code||error.message||"pull-failed"});
    emit(isOffline()?"offline":"error");
    console.error("Cloud sync (pull) error:",error); return {ok:false,applied:0};
  }
}

let pushing=null;
export async function pushToCloud({ force=false }={}){
  if(pushing) return pushing;
  pushing=(async()=>{
  try{
    const refs=await syncDocs();
    if(!refs){ saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:"not-signed-in"}); return false; }
    const localData=currentLocalData();
    const changed=lastSyncedData()===null?Object.keys(localData):changedLocalKeys(localData);
    // Nothing changed here since the last sync: no reads, no writes.
    if(!force && !changed.length) return true;
    if(isOffline()){ emit("offline"); return false; }
    emit("syncing");
    const localTimes=stampChangedKeys(localData);
    const version=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const result=await runTransaction(db,async tx=>{
      const snap=await tx.get(refs.data);
      const existing=snap.exists()?(snap.data()||{}):{};
      const cloudData={...(existing.data||{})};
      const cloudTimes={...(existing.keyUpdatedAt||{})};
      const now=Date.now();
      for(const key of Object.keys(localData)){
        const lt=Number(localTimes[key]||0) || now;
        const ct=Number(cloudTimes[key]||0);
        if(!(key in cloudData)||lt>=ct){ cloudData[key]=localData[key]; cloudTimes[key]=lt; }
      }
      tx.set(refs.data,{data:cloudData,keyUpdatedAt:cloudTimes,updatedAt:serverTimestamp()});
      tx.set(refs.meta,{v:version,updatedAt:serverTimestamp()});
      return {data:cloudData,times:cloudTimes};
    });
    const finalTimes=result.times;
    const nowTimes=getKeyTimes();
    for(const [key,value] of Object.entries(result.data)){
      const ct=Number(finalTimes[key]||0);
      const lt=Number(nowTimes[key]||0);
      if(lt<=ct && localStorage.getItem(key)!==value) localStorage.setItem(key,value);
    }
    saveKeyTimes(finalTimes);
    markSynced(result.data);
    try{ localStorage.setItem(VERSION_KEY,version); }catch(e){}
    saveSyncMeta({lastSyncedAt:Date.now(),lastError:null});
    if(force || changed.some(k=>MIRRORED_KEYS.includes(k))){
      try{
        const {mirrorPlansToShared}=await import("./coachAccess.js");
        await mirrorPlansToShared(localData,finalTimes);
      }catch(error){ console.warn("Coach-shared plan mirror failed:",error); }
    }
    emit(hasLocalChanges()?"pending":"synced");
    console.log(`💾 Synced ${changed.length} changed item(s) with the cloud.`);
    return true;
  }catch(error){
    saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:error.code||error.message||"push-failed"});
    emit(isOffline()?"offline":"error");
    console.error("Cloud sync (push) error:",error); return false;
  }
  })();
  try{ return await pushing; } finally { pushing=null; }
}

// Several pages call this besides js/loadHeader.js: one pull per page
// load, shared by every caller.
let initPromise=null;
export function initCloudSync(){
  if(!initPromise) initPromise=startCloudSync();
  return initPromise;
}
async function startCloudSync(){
  const pullResult=await pullFromCloud();
  // pagehide (not beforeunload) keeps the back/forward cache working.
  window.addEventListener("pagehide",()=>{ pushToCloud(); });
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) pushToCloud(); });
  window.addEventListener("online",()=>{ pushToCloud(); });
  window.addEventListener("offline",()=>emit("offline"));
  setInterval(()=>{ if(!document.hidden) pushToCloud(); },30000);
  return pullResult;
}
