// Southbound Cloud Sync - conflict-safe incremental version
import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import { doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const EXACT_KEYS = ["training-progress","training-overrides","habits","entries","user-settings","__eddieos_coros_data_snapshot_v2","strength-plan","strength-exercise-library","strength-workout-library","strength-workout-favorites","strength-schedule","gear-shoes","strength-history","running-log","personal-records","running-programs","training-programs"];
const KEY_PREFIXES = ["nutrition-","fueling-","cross-training-"];
const META_KEY = "__cloudSyncMeta";
const SNAPSHOT_KEY = "__cloudSyncSnapshot";
const TIMES_KEY = "__cloudSyncKeyTimes";

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
function snapshotData(data){ return JSON.stringify(data); }
function markSynced(data=currentLocalData()){ try{ localStorage.setItem(SNAPSHOT_KEY,snapshotData(data)); }catch(e){} }
function lastSyncedData(){ try{ const raw=localStorage.getItem(SNAPSHOT_KEY); return raw===null?null:(JSON.parse(raw)||{}); }catch(e){ return null; } }
function changedLocalKeys(data){
  const prev=lastSyncedData();
  if(prev===null) return [];
  const changed=[];
  const keys=new Set([...Object.keys(prev),...Object.keys(data)]);
  for(const k of keys) if((prev[k]??null)!==(data[k]??null)) changed.push(k);
  return changed;
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
async function getSyncDoc(){ const user=await waitForUser(); return user?doc(db,"users",user.uid,"sync","localStorage"):null; }

// Returns {ok, applied} rather than a bare boolean so a caller can
// tell whether the pull actually changed anything locally (applied >
// 0) versus this device already being current -- used to decide
// whether a fresh page load needs to reload itself to show newly
// pulled data. No existing caller reads the old boolean return value,
// so this is a safe shape change.
export async function pullFromCloud(){
  try{
    const docRef=await getSyncDoc();
    if(!docRef){ saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:"not-signed-in"}); return {ok:false,applied:0}; }
    const snap=await getDoc(docRef);
    if(!snap.exists()){ markSynced(); saveSyncMeta({lastSyncedAt:Date.now(),lastError:null}); return {ok:false,applied:0}; }
    const cloud=snap.data()||{};
    const stored=cloud.data||{};
    const cloudTimes=cloud.keyUpdatedAt||{};
    const localTimes=getKeyTimes();
    const legacy=legacyTimestamp(cloud.updatedAt);
    let applied=0;
    for(const key of Object.keys(stored)){
      const ct=Number(cloudTimes[key]||legacy||0);
      const lt=Number(localTimes[key]||0);
      if(lt>ct) continue;
      const changed=localStorage.getItem(key)!==stored[key];
      localStorage.setItem(key,stored[key]);
      if(ct>0) localTimes[key]=ct;
      if(changed) applied++;
    }
    try{
      const {pullSharedPlanUpdates}=await import("./coachAccess.js");
      applied+=await pullSharedPlanUpdates(localTimes);
    }catch(error){ console.warn("Coach-shared plan pull failed:",error); }
    saveKeyTimes(localTimes);
    markSynced();
    saveSyncMeta({lastSyncedAt:Date.now(),lastError:null});
    console.log(`☁️ Pulled ${applied} item(s) from the cloud.`);
    return {ok:true,applied};
  }catch(error){
    saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:error.code||error.message||"pull-failed"});
    console.error("Cloud sync (pull) error:",error); return {ok:false,applied:0};
  }
}

export async function pushToCloud(){
  try{
    const docRef=await getSyncDoc();
    if(!docRef){ saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:"not-signed-in"}); return false; }
    const localData=currentLocalData();
    const localTimes=stampChangedKeys(localData);
    const result=await runTransaction(db,async tx=>{
      const snap=await tx.get(docRef);
      const existing=snap.exists()?(snap.data()||{}):{};
      const cloudData={...(existing.data||{})};
      const cloudTimes={...(existing.keyUpdatedAt||{})};
      const now=Date.now();
      for(const key of Object.keys(localData)){
        const lt=Number(localTimes[key]||0) || now;
        const ct=Number(cloudTimes[key]||0);
        if(!(key in cloudData)||lt>=ct){ cloudData[key]=localData[key]; cloudTimes[key]=lt; }
      }
      tx.set(docRef,{data:cloudData,keyUpdatedAt:cloudTimes,updatedAt:serverTimestamp()});
      return {data:cloudData,times:cloudTimes};
    });
    const finalTimes=result.times;
    for(const [key,value] of Object.entries(result.data)){
      const ct=Number(finalTimes[key]||0);
      const lt=Number(getKeyTimes()[key]||0);
      if(lt<=ct) localStorage.setItem(key,value);
    }
    saveKeyTimes(finalTimes);
    markSynced(result.data);
    saveSyncMeta({lastSyncedAt:Date.now(),lastError:null});
    try{
      const {mirrorPlansToShared}=await import("./coachAccess.js");
      await mirrorPlansToShared(localData,finalTimes);
    }catch(error){ console.warn("Coach-shared plan mirror failed:",error); }
    console.log(`💾 Synced ${Object.keys(result.data).length} item(s) with the cloud.`);
    return true;
  }catch(error){
    saveSyncMeta({lastSyncedAt:getSyncStatus().lastSyncedAt,lastError:error.code||error.message||"push-failed"});
    console.error("Cloud sync (push) error:",error); return false;
  }
}

let autoPushArmed=false;
export async function initCloudSync(){
  const pullResult=await pullFromCloud();
  if(autoPushArmed) return pullResult;
  autoPushArmed=true;
  window.addEventListener("beforeunload",()=>{ pushToCloud(); });
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) pushToCloud(); });
  setInterval(()=>{ pushToCloud(); },30000);
  return pullResult;
}
