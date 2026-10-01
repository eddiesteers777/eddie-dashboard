// Southbound Cloud Sync - conflict-safe incremental version
//
// One Firestore doc per account (users/{uid}/sync/localStorage) mirrors
// the keys below, last write wins per key (keyUpdatedAt). A tiny second
// doc (users/{uid}/sync/meta, same owner-only rule) holds a version that
// changes on every push, so a page load reads ~100 bytes to learn that
// nothing changed instead of downloading the whole data doc each time.
// Pushes happen only when a synced key actually changed on this device
// (checked every 30 s, when the page is hidden or left, and when the
// connection comes back); nothing is sent or read while offline.
// Status for the page (the offline/sync indicator, the header's sync
// button) goes out as a "sb:sync-status" event: { state, pending, lastSyncedAt }.
import { db } from "./firebase.js";
import { waitForUser, getCurrentUser } from "./auth.js";
import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const EXACT_KEYS = ["training-progress","training-overrides","habits","entries","user-settings","__eddieos_coros_data_snapshot_v2","strength-plan","strength-exercise-library","strength-workout-library","strength-workout-favorites","strength-schedule","gear-shoes","strength-history","running-log","personal-records","running-programs","training-programs","planner-events","coach-plans","coach-exercise-videos","coach-workout-library","coach-plan-prompts","coros-sent","coros-auto-send","coros-run-history","coros-fitness-history","coros-health-history","coros-health-backfill","coros-laps","readiness-checkins","readiness-settings","readiness-history","profile-checks","coach-health-reviewed","coach-queue-done"];
const KEY_PREFIXES = ["nutrition-","fueling-","cross-training-"];
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
let syncUserUid = null;
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
  if(!user){
    syncUserUid=null;
    syncedCache=undefined;
    return null;
  }
  if(syncUserUid!==user.uid){
    syncUserUid=user.uid;
    syncedCache=undefined;
  }
  return {
    user,
    uid:user.uid,
    data:doc(db,"users",user.uid,"sync","localStorage"),
    meta:doc(db,"users",user.uid,"sync","meta")
  };
}
function currentAccountIs(uid){
  return Boolean(uid && getCurrentUser()?.uid===uid);
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
    const uid=refs.uid;
    if(isOffline()){ emit("offline"); return {ok:false,applied:0,offline:true}; }
    emit("syncing");
    // Nothing new in the cloud since this device last read it: skip the big read.
    let cloudVersion=null;
    try{
      const metaSnap=await getDoc(refs.meta);
      if(!currentAccountIs(uid)) return {ok:false,applied:0,stale:true};
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
    if(!currentAccountIs(uid)) return {ok:false,applied:0,stale:true};
    if(snap.metadata?.fromCache){ emit("offline"); return {ok:false,applied:0,offline:true}; }
    if(!snap.exists()){
      markSynced();
      saveSyncMeta({lastSyncedAt:Date.now(),lastError:null});
      emit("synced");
      return {ok:false,applied:0};
    }
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
    if(!currentAccountIs(uid)) return {ok:false,applied:0,stale:true};
    try{
      const {pullSharedPlanUpdates}=await import("./coachAccess.js");
      applied+=await pullSharedPlanUpdates(localTimes, uid);
      if(!currentAccountIs(uid)) return {ok:false,applied:0,stale:true};
    }catch(error){ console.warn("Coach-shared plan pull failed:",error); }
    saveKeyTimes(localTimes);
    markSynced();
    // Accounts from before the version doc get one now, so the next page
    // load can skip the big read.
    if(!cloudVersion){
      cloudVersion=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      try{ await setDoc(refs.meta,{v:cloudVersion,updatedAt:serverTimestamp()}); }catch(e){ cloudVersion=null; }
    }
    if(!currentAccountIs(uid)) return {ok:false,applied:0,stale:true};
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
let pushingUid=null;
export async function pushToCloud({ force=false }={}){
  const user=await waitForUser();
  if(!user){
    saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:"not-signed-in"});
    return false;
  }
  const uid=user.uid;
  if(pushing && pushingUid===uid) return pushing;
  if(syncUserUid!==uid){
    syncUserUid=uid;
    syncedCache=undefined;
  }
  const promise=(async()=>{
  try{
    const refs={
      user,
      uid,
      data:doc(db,"users",uid,"sync","localStorage"),
      meta:doc(db,"users",uid,"sync","meta")
    };
    const localData=currentLocalData();
    const changed=lastSyncedData()===null?Object.keys(localData):changedLocalKeys(localData);
    const localData=currentLocalData();
    const changed=lastSyncedData()===null?Object.keys(localData):changedLocalKeys(localData);
    // Nothing changed here since the last sync: no reads, no writes.
    if(!force && !changed.length) return true;
    if(isOffline()){ emit("offline"); return false; }
    emit("syncing");
    const localTimes=stampChangedKeys(localData);
    const version=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    if(!currentAccountIs(uid)) return false;
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
    if(!currentAccountIs(uid)) return false;
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
      if(!currentAccountIs(uid)) return false;
      try{
        const {mirrorPlansToShared}=await import("./coachAccess.js");
        await mirrorPlansToShared(localData,finalTimes,uid);
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
  pushingUid=uid;
  pushing=promise;
  try{ return await promise; } finally {
    if(pushing===promise){
      pushing=null;
      pushingUid=null;
    }
  }
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
