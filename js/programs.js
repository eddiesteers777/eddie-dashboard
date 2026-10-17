import { loadRunningPrograms } from './runningPrograms.js';
import { loadTrainingPrograms, saveTrainingPrograms } from './trainingPrograms.js';
import { getLocalCoachNotes } from './coachNotesLocal.js';
import { generateTrainingPlan } from './trainingPlanGenerator.js';
import { syncTrainingPlanStrengthSchedule, deactivateTrainingPlanStrengthSchedule } from './trainingPlanStrengthIntegration.js';
import { getRacePlanStrengthAvailability } from './racePlanStrengthIntegration.js';
import { START_DATE as MARATHON_START_DATE, RACE_DATE as MARATHON_RACE_DATE } from './marathonData.js';
import { showsPersonalPlan } from './role.js';
import { toast, sbAlert, sbConfirm, sbChoose } from './ui.js';
import {
    raceProgram, trainingProgram, marathonProgram, groupPrograms, currentWeekIndex, phaseRuns, dayCell, seasonLayout, seasonNote,
    programChecks, programCounts, shortDate, daysBetween, isoOf, DAY_CODES
} from './programsView.js';

const SELECTED_KEY = 'programs-selected';

const GOAL_LABELS = {
    STRENGTH: 'Build Strength',
    RUN_MAINTENANCE: 'Running Maintenance',
    BASE_BUILD: 'Base Building',
    SPEED: 'Speed Development',
    RUN_STRENGTH: 'Running Strength',
    VERTICAL_POWER: 'Vertical / Power',
    HYPERTROPHY: 'Hypertrophy',
    ATHLETIC: 'Athletic Development'
};

function formatMiles(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function uid() {
    return window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `tp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function normalizeStatus(program) {
    const status = String(program?.status || '').toLowerCase();
    if (['active', 'paused', 'archived', 'draft', 'generated'].includes(status)) return status === 'generated' ? 'draft' : status;
    return program?.generatedPlan ? 'active' : 'draft';
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// A coach with linked access can leave notes on a client's plan (see
// clients.html / js/coachAccess.js); cloud sync mirrors those notes
// down into localStorage on every pull, so the client sees the
// latest one right on the plan card without visiting My Clients.
function coachNotesBadge(field, programId) {
    const notes = getLocalCoachNotes()?.[field]?.[programId];
    if (!notes || !notes.length) return '';
    const latest = notes[notes.length - 1];
    const extra = notes.length - 1;
    return `
        <div class="program-coach-note">
            <strong>Note from ${escapeHtml(latest.author || 'Coach')}</strong>
            <p>${escapeHtml(latest.text)}</p>
            ${extra > 0 ? `<span class="program-coach-note-more">+${extra} more note${extra === 1 ? '' : 's'}</span>` : ''}
        </div>
    `;
}

function datesOverlap(startA, endA, startB, endB) {
    if (!startA || !endA || !startB || !endB) return false;
    return startA <= endB && startB <= endA;
}

function toIsoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatConflictList(conflicts) {
    return conflicts.map(conflict => `• ${conflict.name} (${formatDate(conflict.start)} → ${formatDate(conflict.end)})`).join('\n');
}

function getTrainingPlanConflicts(candidateStart, candidateEnd, excludeId) {
    const conflicts = [];

    for (const plan of loadTrainingPrograms()) {
        if (!plan || plan.id === excludeId || normalizeStatus(plan) !== 'active' || !plan.generatedPlan) continue;
        if (datesOverlap(candidateStart, candidateEnd, plan.generatedPlan.trainingStartDate, plan.generatedPlan.raceDate)) {
            conflicts.push({ name: plan.name || 'Active training plan', start: plan.generatedPlan.trainingStartDate, end: plan.generatedPlan.raceDate });
        }
    }

    for (const plan of loadRunningPrograms()) {
        if (!plan || normalizeStatus(plan) !== 'active' || !plan.generatedPlan) continue;
        if (datesOverlap(candidateStart, candidateEnd, plan.generatedPlan.trainingStartDate, plan.generatedPlan.raceDate)) {
            conflicts.push({ name: plan.name || 'Active race plan', start: plan.generatedPlan.trainingStartDate, end: plan.generatedPlan.raceDate });
        }
    }

    const marathonStart = toIsoDate(MARATHON_START_DATE);
    const marathonEnd = toIsoDate(MARATHON_RACE_DATE);
    // Only the coach's own race block can clash (js/role.js).
    if (showsPersonalPlan() && marathonStart && marathonEnd && datesOverlap(candidateStart, candidateEnd, marathonStart, marathonEnd)) {
        conflicts.push({ name: 'Existing Indianapolis Marathon plan', start: marathonStart, end: marathonEnd });
    }

    return conflicts;
}

async function activateTrainingPlan(id) {
    const programs = loadTrainingPrograms();
    const plan = programs.find(item => item.id === id);
    if (!plan) return;

    let result;
    try {
        result = generateTrainingPlan(plan.settings || {});
    } catch (error) {
        await sbAlert(error.message || 'Check its settings and try again.', { title: "Couldn't build this plan" });
        return;
    }

    const { generatedPlan, warnings } = result;
    const conflicts = getTrainingPlanConflicts(generatedPlan.trainingStartDate, generatedPlan.raceDate, id);
    if (conflicts.length) {
        await sbAlert(`${formatConflictList(conflicts)}\n\nNothing was deleted or changed. Pause or archive the other plan, or change this plan's dates, then try again.`, { title: 'This plan overlaps an active plan' });
        return;
    }

    if (generatedPlan.liftDaysPerWeek > 0 && !getRacePlanStrengthAvailability().available) {
        const proceed = await sbConfirm('This plan schedules Strength sessions, but there is no current Strength plan to put on the calendar. You can activate it without Strength sessions, or keep it inactive for now.', { title: 'No Strength plan found', confirmLabel: 'Activate without Strength', cancelLabel: 'Keep inactive' });
        if (!proceed) return;
    }

    const now = new Date().toISOString();
    plan.status = 'active';
    plan.generatedPlan = generatedPlan;
    plan.updatedAt = now;
    plan.calendarActivatedAt = plan.calendarActivatedAt || now;
    plan.archivedAt = null;
    plan.pausedAt = null;

    await saveTrainingPrograms(programs);

    let strengthResult = { warning: '' };
    try {
        strengthResult = await syncTrainingPlanStrengthSchedule(plan);
    } catch (error) {
        console.error('Training-plan Strength calendar integration failed:', error);
        toast('Plan activated, but the Strength calendar could not be updated. Your existing Strength schedule is unchanged.', { type: 'error' });
    }

    renderPage();
    window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { programId: id, action: 'activated' } }));
    window.dispatchEvent(new CustomEvent('eddieos:running-programs-changed', { detail: { programId: id, action: 'activated' } }));
    window.dispatchEvent(new CustomEvent('eddieos:running-program-added', {
        detail: { programId: id, startDate: generatedPlan.trainingStartDate, raceDate: generatedPlan.raceDate, status: 'active' }
    }));

    const combinedWarnings = [...warnings, ...(strengthResult.warning ? [strengthResult.warning] : [])];
    if (combinedWarnings.length) {
        await sbAlert(combinedWarnings.map(item => `• ${item}`).join('\n'), { title: 'Training plan activated, with notes' });
    } else {
        toast('Training plan activated. It is on your Running and Strength calendars.');
    }
}

async function updateTrainingPlanStatus(id, nextStatus) {
    const programs = loadTrainingPrograms();
    const plan = programs.find(item => item.id === id);
    if (!plan) return;

    const now = new Date().toISOString();
    plan.status = nextStatus;
    plan.updatedAt = now;
    if (nextStatus === 'paused') plan.pausedAt = now;
    if (nextStatus === 'archived') {
        plan.archivedAt = now;
        plan.pausedAt = null;
    }

    await saveTrainingPrograms(programs);

    try {
        if (nextStatus === 'paused' || nextStatus === 'archived') {
            await deactivateTrainingPlanStrengthSchedule(id);
        }
    } catch (error) {
        console.error('Training-plan Strength cleanup failed:', error);
    }

    renderPage();
    window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { programId: id, action: nextStatus } }));
    window.dispatchEvent(new CustomEvent('eddieos:running-programs-changed', { detail: { programId: id, action: nextStatus } }));
}

function applyTrainingSettings(settings) {
    document.getElementById('trainingPlanBuilder')?.reset();
    document.querySelectorAll('[data-primary-goal]').forEach(button => {
        button.classList.toggle('selected', button.dataset.primaryGoal === settings.primaryGoal);
    });
    document.querySelectorAll('input[name="secondaryGoals"]').forEach(input => {
        input.checked = (settings.secondaryGoals || []).includes(input.value);
    });
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el && value !== undefined && value !== null && value !== '') el.value = value;
    };
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(value);
    };
    setValue('trainingPlanName', settings.name);
    setValue('trainingStartDate', settings.startDate);
    setValue('trainingEndDate', settings.endDate);
    setValue('trainingRunDays', settings.runDays);
    setValue('trainingLiftDays', settings.liftDays);
    setValue('trainingCrossDays', settings.crossDays);
    setChecked('trainingSundayRest', settings.sundayRest);
    setChecked('trainingAllowDoubles', settings.allowDoubles);
    setValue('trainingMaxDoubles', settings.maxDoubles);
    setValue('trainingLongRunDay', settings.longRunDay);
    setValue('trainingCurrentMiles', settings.currentMiles);
    setValue('trainingTargetMiles', settings.targetMiles);
    setValue('trainingMaxMiles', settings.maxMiles);
    setValue('trainingLongMin', settings.longMin);
    setValue('trainingLongMax', settings.longMax);
    setValue('trainingSpeedDays', settings.speedDays);
    updateTrainingDuration();
}

function localIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateTrainingDuration() {
    const start = document.getElementById('trainingStartDate')?.value;
    const end = document.getElementById('trainingEndDate')?.value;
    const output = document.getElementById('trainingDuration');
    if (!output) return;
    if (!start || !end) {
        output.textContent = 'Choose both dates';
        return;
    }
    const a = new Date(`${start}T00:00:00`);
    const b = new Date(`${end}T00:00:00`);
    const days = Math.round((b - a) / 86400000) + 1;
    if (days <= 0) {
        output.textContent = 'End date must be after start';
        return;
    }
    const weeks = Math.max(1, Math.round(days / 7));
    output.textContent = `${weeks} weeks · ${days} days`;
}

function collectTrainingDraft() {
    return {
        primaryGoal: document.querySelector('[data-primary-goal].selected')?.dataset.primaryGoal || '',
        secondaryGoals: [...document.querySelectorAll('input[name="secondaryGoals"]:checked')].map(input => input.value),
        name: document.getElementById('trainingPlanName')?.value.trim() || '',
        startDate: document.getElementById('trainingStartDate')?.value || '',
        endDate: document.getElementById('trainingEndDate')?.value || '',
        runDays: Number(document.getElementById('trainingRunDays')?.value || 0),
        liftDays: Number(document.getElementById('trainingLiftDays')?.value || 0),
        crossDays: Number(document.getElementById('trainingCrossDays')?.value || 0),
        sundayRest: Boolean(document.getElementById('trainingSundayRest')?.checked),
        allowDoubles: Boolean(document.getElementById('trainingAllowDoubles')?.checked),
        maxDoubles: Number(document.getElementById('trainingMaxDoubles')?.value || 0),
        longRunDay: document.getElementById('trainingLongRunDay')?.value || 'SAT',
        currentMiles: Number(document.getElementById('trainingCurrentMiles')?.value || 0),
        targetMiles: Number(document.getElementById('trainingTargetMiles')?.value || 0),
        maxMiles: Number(document.getElementById('trainingMaxMiles')?.value || 0),
        longMin: Number(document.getElementById('trainingLongMin')?.value || 0),
        longMax: Number(document.getElementById('trainingLongMax')?.value || 0),
        speedDays: Number(document.getElementById('trainingSpeedDays')?.value || 0)
    };
}

function renderTrainingReview() {
    const target = document.getElementById('trainingPlanReview');
    if (!target) return;
    const draft = collectTrainingDraft();
    const secondary = draft.secondaryGoals.length ? draft.secondaryGoals.join(', ').replaceAll('_', ' ') : 'None selected';
    const dateRange = draft.startDate && draft.endDate ? `${formatDate(draft.startDate)} → ${formatDate(draft.endDate)}` : 'Dates not set';
    const miles = `${formatMiles(draft.currentMiles)} → ${formatMiles(draft.targetMiles)} target · ${formatMiles(draft.maxMiles)} max`;
    const longRun = draft.longMax ? `${draft.longMin}–${draft.longMax} mi · ${draft.longRunDay}` : 'Not set';
    target.innerHTML = `
        <div class="training-review-card"><small>Primary goal</small><strong>${escapeHtml(GOAL_LABELS[draft.primaryGoal] || 'Choose a goal')}</strong><span>Secondary: ${escapeHtml(secondary)}</span></div>
        <div class="training-review-card"><small>Program window</small><strong>${escapeHtml(draft.name || 'Untitled training block')}</strong><span>${escapeHtml(dateRange)}</span></div>
        <div class="training-review-card"><small>Weekly structure</small><strong>${draft.runDays} runs · ${draft.liftDays} lifts · ${draft.crossDays} cross</strong><span>${draft.sundayRest ? 'Sunday rest' : 'No fixed Sunday rest'} · ${draft.allowDoubles ? `${draft.maxDoubles} doubles max` : 'No doubles'}</span></div>
        <div class="training-review-card"><small>Running workload</small><strong>${escapeHtml(miles)}</strong><span>Long run: ${escapeHtml(longRun)} · ${draft.speedDays} speed session${draft.speedDays === 1 ? '' : 's'}</span></div>
    `;
}

function showTrainingStep(step) {
    const steps = [...document.querySelectorAll('.training-step')];
    const max = steps.length;
    const next = Math.min(max, Math.max(1, step));
    steps.forEach(panel => panel.classList.toggle('active', Number(panel.dataset.trainingStep) === next));
    const fill = document.getElementById('trainingProgressFill');
    if (fill) fill.style.width = `${(next / max) * 100}%`;
    const current = document.getElementById('trainingStepCurrent');
    if (current) current.textContent = String(next);
    const title = document.getElementById('trainingStepTitle');
    const titles = ['Goal', 'Dates', 'Schedule', 'Workload', 'Review'];
    if (title) title.textContent = titles[next - 1] || 'Review';
    const back = document.getElementById('trainingBack');
    if (back) back.hidden = next === 1;
    const nextBtn = document.getElementById('trainingNext');
    if (nextBtn) nextBtn.textContent = next === max ? 'Save draft' : 'Continue';
    if (next === max) renderTrainingReview();
    document.querySelector('.training-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetTrainingBuilder() {
    document.getElementById('trainingPlanBuilder')?.reset();
    document.querySelectorAll('[data-primary-goal]').forEach(button => button.classList.remove('selected'));
    const start = document.getElementById('trainingStartDate');
    const end = document.getElementById('trainingEndDate');
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 83);
    if (start) start.value = localIsoDate(today);
    if (end) end.value = localIsoDate(endDate);
    document.getElementById('trainingRunDays').value = '5';
    document.getElementById('trainingLiftDays').value = '3';
    document.getElementById('trainingCrossDays').value = '0';
    document.getElementById('trainingMaxDoubles').value = '2';
    document.getElementById('trainingCurrentMiles').value = '25';
    document.getElementById('trainingTargetMiles').value = '28';
    document.getElementById('trainingMaxMiles').value = '30';
    document.getElementById('trainingLongMin').value = '8';
    document.getElementById('trainingLongMax').value = '10';
    document.getElementById('trainingSpeedDays').value = '1';
    showTrainingStep(1);
    updateTrainingDuration();
}

// ---------- the page ----------

let selectedKey = null;
let editingDraftId = null;
let currentStep = 1;

function readSelected() {
    try { return sessionStorage.getItem(SELECTED_KEY); } catch { return null; }
}

function rememberSelected(key) {
    try { sessionStorage.setItem(SELECTED_KEY, key); } catch { /* nothing to remember it with */ }
}

function loadPrograms() {
    const programs = [];
    if (showsPersonalPlan()) programs.push(marathonProgram());
    for (const item of loadRunningPrograms()) {
        if (item && (item.generatedPlan || item.settings || item.raceType)) programs.push(raceProgram(item));
    }
    for (const item of loadTrainingPrograms()) {
        if (!item) continue;
        let preview = null;
        if (!item.generatedPlan && item.settings) {
            // The same generator Activate uses, only to show the weeks; nothing is saved.
            try { preview = generateTrainingPlan(item.settings).generatedPlan; } catch { preview = null; }
        }
        programs.push(trainingProgram(item, preview));
    }
    return programs;
}

const KIND_LABELS = { now: 'Now', next: 'Up next', drafts: 'Draft', finished: 'Finished' };

function statusKicker(program, bucket, weekIndex) {
    const parts = [];
    if (program.status === 'paused') parts.push('Paused');
    else parts.push(KIND_LABELS[bucket]);
    parts.push(program.kind);
    if (bucket === 'now' && weekIndex >= 0) parts.push(`Week ${weekIndex + 1} of ${program.totalWeeks}`);
    else if (program.totalWeeks) parts.push(`${program.totalWeeks} wk`);
    return parts.join(' · ');
}

function countdown(program, bucket, today) {
    if (bucket === 'now') {
        const n = daysBetween(today, program.end);
        return n >= 0 ? { n, label: n === 1 ? 'day to go' : 'days to go' } : null;
    }
    if (bucket === 'next') {
        const n = daysBetween(today, program.start);
        return { n, label: n === 1 ? 'day to start' : 'days to start' };
    }
    return null;
}

function sparkHtml(program, className = '') {
    const miles = program.weeks.map(week => week.miles);
    const max = Math.max(1, ...miles);
    if (!miles.length) return `<div class="pg-spark ${className} is-empty" aria-hidden="true"></div>`;
    return `<div class="pg-spark ${className}" aria-hidden="true">${miles.map(m => `<i style="height:${Math.max(8, Math.round((m / max) * 100))}%"></i>`).join('')}</div>`;
}

function renderCounts(programs) {
    const counts = programCounts(programs);
    const el = document.getElementById('pgCounts');
    if (!el) return;
    const bits = [];
    if (counts.active) bits.push(`${counts.active} active`);
    if (counts.paused) bits.push(`${counts.paused} paused`);
    if (counts.draft) bits.push(`${counts.draft} draft${counts.draft === 1 ? '' : 's'}`);
    if (counts.archived) bits.push(`${counts.archived} archived`);
    el.textContent = bits.join(' · ') || 'No programs yet';
}

function renderSeason(programs, today) {
    const card = document.getElementById('pgSeason');
    if (!card) return;
    const layout = seasonLayout(programs, today);
    if (!layout) { card.hidden = true; return; }
    card.hidden = false;
    const note = seasonNote(programs, today);
    const laneHeight = 52;
    card.innerHTML = `
        <div class="pg-card-head"><span class="pg-kicker">Your season</span><span class="pg-data">${escapeHtml(shortDate(today))} today</span></div>
        <div class="pg-season-scroll">
            <div class="pg-season">
                <div class="pg-months">${layout.months.map(m => `<span style="left:${m.left}%">${m.label}</span>`).join('')}</div>
                <div class="pg-lanes" style="height:${layout.lanes * laneHeight}px">
                    ${layout.blocks.map(b => `<button type="button" class="pg-blk is-${b.tone}${b.key === selectedKey ? ' is-selected' : ''}" data-select="${escapeHtml(b.key)}" style="left:${b.left}%;width:${b.width}%;top:${b.lane * laneHeight}px" title="${escapeHtml(b.name)}"><span>${escapeHtml(b.name)}</span></button>`).join('')}
                    ${layout.todayPct === null ? '' : `<i class="pg-today" style="left:${layout.todayPct}%" aria-hidden="true"></i>`}
                </div>
            </div>
        </div>
        <p class="pg-note${note.warn ? ' is-warn' : ''}">${escapeHtml(note.text)}</p>`;
}

function renderList(groups) {
    const el = document.getElementById('pgList');
    if (!el) return;
    const section = (title, items, finished = false) => {
        if (!items.length) return '';
        return `<div class="pg-group"><div class="pg-kicker">${title}</div>${items.map(program => `
            <button type="button" class="pg-item${program.key === selectedKey ? ' is-selected' : ''}" data-select="${escapeHtml(program.key)}">
                ${sparkHtml(program, finished ? 'is-done' : '')}
                <span class="pg-item-main">
                    <strong>${escapeHtml(program.name)}</strong>
                    <span class="pg-data">${escapeHtml(itemMeta(program))}</span>
                </span>
                ${program.status === 'paused' ? '<span class="pg-chip">Paused</span>' : finished ? '<span class="pg-chip is-sage">Done</span>' : ''}
            </button>`).join('')}</div>`;
    };
    el.innerHTML = [
        section('Now', groups.now), section('Up next', groups.next),
        section('Drafts and paused', groups.drafts), section('Finished', groups.finished, true)
    ].join('') || '<p class="pg-note">Nothing here yet.</p>';
}

function itemMeta(program) {
    const range = program.start && program.end ? `${shortDate(program.start)} → ${shortDate(program.end)}` : 'Dates not set';
    const weeks = program.totalWeeks ? ` · ${program.totalWeeks} wk` : '';
    return `${range}${weeks}`;
}

function actionsHtml(program) {
    if (program.source === 'marathon') {
        return `<a class="sb-btn sb-btn-primary" href="marathon.html">Open the marathon plan</a>`;
    }
    if (program.source === 'race') {
        return `<a class="sb-btn sb-btn-primary" href="${program.editHref}">Change it on Running</a>`;
    }
    const id = escapeHtml(program.id);
    const edit = `<button type="button" class="sb-btn sb-btn-secondary" data-training-edit="${id}">Edit</button>`;
    const activate = (primary = true) => `<button type="button" class="sb-btn ${primary ? 'sb-btn-primary' : 'sb-btn-secondary'}" data-training-activate="${id}">Activate</button>`;
    const pause = `<button type="button" class="sb-btn sb-btn-secondary" data-training-pause="${id}">Pause</button>`;
    const archive = `<button type="button" class="sb-btn sb-btn-tertiary pg-end" data-training-archive="${id}">Archive</button>`;
    const del = `<button type="button" class="sb-btn sb-btn-tertiary pg-danger pg-end" data-training-delete="${id}">Delete</button>`;
    if (program.status === 'active') return `${pause}${archive}`;
    if (program.status === 'paused') return `${activate()}${edit}${archive}`;
    if (program.status === 'archived') return activate(false);
    return `${activate()}${edit}${del}`;
}

function weeksHtml(program, weekIndex) {
    if (!program.weeks.length) {
        return '<p class="pg-note">The weeks appear here once the dates and schedule are set.</p>';
    }
    const head = DAY_CODES.map(code => `<div class="pg-wh">${code[0] + code.slice(1).toLowerCase()}</div>`).join('');
    const rows = program.weeks.map((week, i) => {
        const cells = week.days.map(day => {
            const cell = dayCell(day);
            return `<div class="pg-d ${cell.tone ? 'is-' + cell.tone : ''}" title="${escapeHtml(cell.title)}"><b>${escapeHtml(cell.top)}</b>${cell.sub ? `<small>${escapeHtml(cell.sub)}</small>` : ''}</div>`;
        }).join('');
        return `<div class="pg-w${i === weekIndex ? ' is-now' : ''}"><div class="pg-wn">Wk ${week.n}<small>${escapeHtml(shortDate(week.startDate))}</small></div>${cells}<div class="pg-wt">${escapeHtml(formatMiles(Math.round(week.miles * 10) / 10))}</div></div>`;
    }).join('');
    return `<div class="pg-weeks" role="table" aria-label="Weeks of ${escapeHtml(program.name)}"><div class="pg-w pg-w-head"><div></div>${head}<div class="pg-wh pg-wt">Mi</div></div>${rows}</div>`;
}

function renderDetail(program, programs, bucket, today) {
    const el = document.getElementById('pgDetail');
    if (!el) return;
    if (!program) {
        el.innerHTML = `<div class="pg-empty"><h2 class="pg-h2">No programs yet</h2><p class="pg-p">A program lays out every week from now to a race, or builds a block without one.</p><button type="button" class="sb-btn sb-btn-primary" data-new>+ New program</button></div>`;
        return;
    }
    const weekIndex = bucket === 'now' ? currentWeekIndex(program, today) : -1;
    const count = countdown(program, bucket, today);
    const maxMiles = Math.max(1, ...program.weeks.map(w => w.miles));
    const bars = program.weeks.length ? `
        <div class="pg-bars" aria-hidden="true">${program.weeks.map((w, i) => `<i class="${weekIndex >= 0 && i < weekIndex ? 'is-done' : i === weekIndex ? 'is-now' : ''}" style="height:${Math.max(6, Math.round((w.miles / maxMiles) * 100))}%" title="Week ${w.n}: ${formatMiles(Math.round(w.miles * 10) / 10)} mi"></i>`).join('')}</div>
        <div class="pg-phases">${phaseRuns(program.weeks).map(run => `<span class="${weekIndex > run.to ? 'is-done' : weekIndex >= run.from ? 'is-on' : ''}" style="flex:${run.count}"><em>${escapeHtml(run.label)}</em></span>`).join('')}</div>` : '';
    const thisWeek = weekIndex >= 0 ? program.weeks[weekIndex] : null;
    const stats = [
        thisWeek ? ['This week', `${formatMiles(Math.round(thisWeek.miles * 10) / 10)} mi`] : ['Peak week', program.peak ? `${formatMiles(program.peak)} mi` : '—'],
        ['Longest run', program.longest ? `${formatMiles(program.longest)} mi` : '—'],
        program.runDays || program.liftDays ? ['Each week', `${program.runDays} run${program.runDays === 1 ? '' : 's'}${program.liftDays ? ` · ${program.liftDays} lift${program.liftDays === 1 ? '' : 's'}` : ''}`] : ['Length', program.totalWeeks ? `${program.totalWeeks} wk` : '—']
    ];
    const checks = programChecks(program, programs, { strengthAvailable: program.source === 'training' ? getRacePlanStrengthAvailability().available : true });
    const notesField = program.source === 'race' ? 'runningPrograms' : program.source === 'training' ? 'trainingPrograms' : '';
    const sub = [itemMeta(program), program.goal ? `Goal ${program.goal}` : ''].filter(Boolean).join(' · ');
    el.innerHTML = `
        <article class="pg-card pg-program ${bucket === 'now' ? 'is-now' : ''}">
            <div class="pg-kicker">${escapeHtml(statusKicker(program, bucket, weekIndex))}</div>
            <div class="pg-title-row">
                <h2 class="pg-h2">${escapeHtml(program.name)}</h2>
                ${count ? `<div class="pg-count"><b>${count.n}</b><span>${count.label}</span></div>` : ''}
            </div>
            <p class="pg-p">${escapeHtml(sub)}</p>
            ${bars}
            <div class="pg-stats">${stats.map(([label, value]) => `<div><span class="pg-data">${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>
            ${program.preview ? '<p class="pg-note">This is a preview from your settings. Activate it to put these weeks on your calendar.</p>' : ''}
            <div class="pg-actions">${actionsHtml(program)}</div>
            ${notesField ? coachNotesBadge(notesField, program.id) : ''}
        </article>
        <section class="pg-card pg-weeks-card">
            <div class="pg-card-head"><span class="pg-kicker">The weeks</span><span class="pg-data">${program.weeks.length ? 'Miles per day' : ''}</span></div>
            ${weeksHtml(program, weekIndex)}
        </section>
        <section class="pg-card">
            <div class="pg-kicker">Checks</div>
            ${checks.map(c => `<div class="pg-check"><i class="${c.warn ? 'is-warn' : ''}" aria-hidden="true"></i><span>${escapeHtml(c.text)}</span></div>`).join('')}
        </section>`;
    window.requestAnimationFrame?.(() => {
        const row = el.querySelector('.pg-w.is-now');
        const box = el.querySelector('.pg-weeks');
        if (row && box && box.scrollHeight > box.clientHeight) box.scrollTop = Math.max(0, row.offsetTop - 80);
    });
}

function renderPage() {
    const today = isoOf(new Date());
    const programs = loadPrograms();
    const groups = groupPrograms(programs, today);
    const order = [...groups.now, ...groups.next, ...groups.drafts, ...groups.finished];
    if (!selectedKey || !order.some(p => p.key === selectedKey)) selectedKey = order[0]?.key || null;
    const selected = order.find(p => p.key === selectedKey) || null;
    const bucket = selected ? Object.keys(groups).find(k => groups[k].includes(selected)) : 'now';
    renderCounts(programs);
    renderSeason(programs, today);
    renderDetail(selected, programs, bucket, today);
    renderList(groups);
}

function select(key) {
    selectedKey = key;
    rememberSelected(key);
    renderPage();
    document.getElementById('pgDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- the training block builder ----------

function openBuilder({ draftId = null } = {}) {
    const builder = document.getElementById('pgBuilder');
    if (!builder) return;
    builder.hidden = false;
    editingDraftId = draftId;
    currentStep = 1;
    if (draftId) {
        const draft = loadTrainingPrograms().find(item => item.id === draftId);
        applyTrainingSettings(draft?.settings || {});
    } else {
        resetTrainingBuilder();
    }
    showTrainingStep(1);
}

function closeBuilder() {
    editingDraftId = null;
    currentStep = 1;
    resetTrainingBuilder();
    const builder = document.getElementById('pgBuilder');
    if (builder) builder.hidden = true;
}

async function newProgram() {
    const choice = await sbChoose('A race plan counts weeks back from race day. A training block has no race: off-season, strength, speed or base.', {
        title: 'New program',
        choices: [
            { label: 'Race plan', value: 'race', primary: true },
            { label: 'Training block', value: 'training' }
        ]
    });
    if (choice === 'race') window.location.href = 'running.html?section=race-plans';
    if (choice === 'training') openBuilder();
}

function init() {
    document.querySelectorAll('[data-primary-goal]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-primary-goal]').forEach(item => item.classList.remove('selected'));
            button.classList.add('selected');
        });
    });

    const trainingNext = document.getElementById('trainingNext');
    const trainingBack = document.getElementById('trainingBack');
    trainingNext?.addEventListener('click', () => {
        if (currentStep === 1 && !document.querySelector('[data-primary-goal].selected')) {
            toast('Choose a primary training goal first.', { type: 'info' });
            return;
        }
        if (currentStep === 2) {
            const start = document.getElementById('trainingStartDate')?.value;
            const end = document.getElementById('trainingEndDate')?.value;
            if (!start || !end || end < start) {
                toast('Choose a start date and an end date after it.', { type: 'info' });
                return;
            }
        }
        if (currentStep < 5) {
            currentStep += 1;
            showTrainingStep(currentStep);
            return;
        }

        renderTrainingReview();
        const draftSettings = collectTrainingDraft();
        const programs = loadTrainingPrograms();
        const now = new Date().toISOString();
        const id = editingDraftId || uid();
        const existingIndex = programs.findIndex(item => item.id === id);
        const existing = existingIndex >= 0 ? programs[existingIndex] : null;
        const record = {
            id,
            name: draftSettings.name || 'Untitled training block',
            // Saving the form again keeps a plan paused or active as it was; a new one starts as a draft.
            status: existing?.status || 'draft',
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now,
            settings: draftSettings
        };
        if (existing) {
            // An active plan keeps its generated weeks until it is activated again.
            Object.assign(existing, record);
        } else {
            programs.unshift(record);
        }
        saveTrainingPrograms(programs).then(() => {
            window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { id } }));
        });
        selectedKey = `training:${id}`;
        rememberSelected(selectedKey);
        closeBuilder();
        renderPage();
        toast('Draft saved. Activate it when you are ready.');
    });
    trainingBack?.addEventListener('click', () => {
        currentStep = Math.max(1, currentStep - 1);
        showTrainingStep(currentStep);
    });
    document.getElementById('trainingPlanReset')?.addEventListener('click', closeBuilder);
    document.getElementById('pgNew')?.addEventListener('click', newProgram);

    document.querySelector('.programs-page')?.addEventListener('click', async event => {
        const pick = event.target.closest('[data-select]');
        const editBtn = event.target.closest('[data-training-edit]');
        const deleteBtn = event.target.closest('[data-training-delete]');
        const activateBtn = event.target.closest('[data-training-activate]');
        const pauseBtn = event.target.closest('[data-training-pause]');
        const archiveBtn = event.target.closest('[data-training-archive]');

        if (event.target.closest('[data-new]')) { newProgram(); return; }
        if (pick) { select(pick.dataset.select); return; }

        if (editBtn) {
            openBuilder({ draftId: editBtn.dataset.trainingEdit });
            document.getElementById('pgBuilder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (deleteBtn) {
            const id = deleteBtn.dataset.trainingDelete;
            if (!(await sbConfirm("This can't be undone.", { title: 'Delete this draft?', confirmLabel: 'Delete', danger: true }))) return;
            const remaining = loadTrainingPrograms().filter(item => item.id !== id);
            saveTrainingPrograms(remaining).then(() => {
                if (editingDraftId === id) closeBuilder();
                selectedKey = null;
                renderPage();
                window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { id } }));
            });
            return;
        }

        if (activateBtn) {
            activateTrainingPlan(activateBtn.dataset.trainingActivate);
            return;
        }

        if (pauseBtn) {
            const id = pauseBtn.dataset.trainingPause;
            await updateTrainingPlanStatus(id, 'paused');
            toast('Paused. It is off your calendars.', { action: { label: 'Undo', onClick: () => activateTrainingPlan(id) } });
            return;
        }

        if (archiveBtn) {
            const id = archiveBtn.dataset.trainingArchive;
            if (!(await sbConfirm('It comes off the active calendar, but its history is kept.', { title: 'Archive this training plan?', confirmLabel: 'Archive' }))) return;
            await updateTrainingPlanStatus(id, 'archived');
            toast('Archived.', { action: { label: 'Undo', onClick: () => activateTrainingPlan(id) } });
        }
    });
    ['trainingStartDate', 'trainingEndDate'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateTrainingDuration);
        document.getElementById(id)?.addEventListener('change', updateTrainingDuration);
    });

    document.querySelectorAll('#trainingPlanBuilder input, #trainingPlanBuilder select').forEach(input => {
        input.addEventListener('change', () => {
            if (currentStep === 5) renderTrainingReview();
        });
    });

    resetTrainingBuilder();
    selectedKey = readSelected();
    renderPage();
    // Older links: ?tab=training opens the builder, ?new=training too.
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === 'training' || params.get('tab') === 'training') openBuilder();
}

window.addEventListener('storage', event => {
    if (event.key === 'running-programs' || event.key === 'training-programs') renderPage();
});
window.addEventListener('eddieos:running-programs-changed', renderPage);
window.addEventListener('eddieos:training-programs-changed', renderPage);

document.addEventListener('DOMContentLoaded', init, { once: true });
