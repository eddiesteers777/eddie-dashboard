/* ==========================================
   EddieOS — Coach Dashboard

   A "needs attention" summary plus quick links into My Clients and
   Schedule, rather than duplicating either page's UI here. Deep
   links use ?tab=... which clients.js/schedule.js read on load (see
   selectTab() in each) to land directly on the right tab.
========================================== */

import { listenForAuth } from "./auth.js";
import { isApprovedCoach, listPendingProfiles } from "./userProfile.js";
import { listMyClients } from "./coachAccess.js";
import { listRequestsForMyClients } from "./scheduling.js";

const signedOutEl = document.getElementById("coachSignedOut");
const notApprovedEl = document.getElementById("coachNotApproved");
const dashboardEl = document.getElementById("coachDashboard");

const statPendingAccounts = document.getElementById("statPendingAccounts");
const statPendingAccountsNum = document.getElementById("statPendingAccountsNum");
const statPendingRequests = document.getElementById("statPendingRequests");
const statPendingRequestsNum = document.getElementById("statPendingRequestsNum");
const statActiveClientsNum = document.getElementById("statActiveClientsNum");

async function refreshDashboard() {
    const [pending, clients, requests] = await Promise.all([
        listPendingProfiles(),
        listMyClients(),
        listRequestsForMyClients()
    ]);

    const pendingRequestCount = requests.filter(r => r.status === "requested").length;

    statPendingAccountsNum.textContent = pending.length;
    statPendingAccounts.classList.toggle("coach-stat-attention", pending.length > 0);
    statPendingAccounts.classList.toggle("coach-stat-neutral", pending.length === 0);

    statPendingRequestsNum.textContent = pendingRequestCount;
    statPendingRequests.classList.toggle("coach-stat-attention", pendingRequestCount > 0);
    statPendingRequests.classList.toggle("coach-stat-neutral", pendingRequestCount === 0);

    statActiveClientsNum.textContent = clients.length;
}

listenForAuth(async user => {
    signedOutEl.hidden = Boolean(user);
    dashboardEl.hidden = true;
    notApprovedEl.hidden = true;

    if (!user) return;

    const approved = await isApprovedCoach();
    if (!approved) {
        notApprovedEl.hidden = false;
        return;
    }

    dashboardEl.hidden = false;
    refreshDashboard();
});
