import { loadRunningPrograms } from './runningPrograms.js';
import { loadTrainingPrograms, saveTrainingPrograms } from './trainingPrograms.js';
import { getLocalCoachNotes } from './coachNotesLocal.js';
import { generateTrainingPlan } from './trainingPlanGenerator.js';
import { syncTrainingPlanStrengthSchedule, deactivateTrainingPlanStrengthSchedule } from './trainingPlanStrengthIntegration.js';
import { getRacePlanStrengthAvailability } from './racePlanStrengthIntegration.js';
import { START_DATE as MARATHON_START_DATE, RACE_DATE as MARATHON_RACE_DATE } from './marathonData.js';
import { showsPersonalPlan } from './role.js';

const TAB_KEY = 'programs-tab';
const TAB_NAMES = { race: 'Race Plans', training: 'Training Plans' };
const STATUS_LABELS = {
    active: 'Active',
    paused: 'Paused',
    archived: 'Archived',
    draft: 'Draft',
    generated: 'Draft'
};

function uid() {
    return window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `tp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

function formatMiles(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function getRaceSummary(program) {
    const plan = program.generatedPlan || {};
    const settings = program.settings || {};
    return {
        type: program.type || settings.raceType || plan.raceType || 'Race',
        start: plan.trainingStartDate || settings.trainingStartDate,
        end: plan.raceDate || settings.raceDate,
        goal: plan.goal?.time || settings.goalTime || (plan.goal?.type || settings.goalType || 'Finish'),
        peak: plan.generatedPeakMileage ?? plan.requestedPeakMileage ?? settings.peakMileage,
        weeks: plan.totalWeeks || (plan.weeks || []).length
    };
}

function renderRaceLibrary() {
    const container = document.getElementById('raceProgramLibrary');
    const counts = document.getElementById('raceProgramCounts');
    if (!container || !counts) return;

    const programs = loadRunningPrograms()
        .filter(program => program && (program.generatedPlan || program.settings || program.raceType))
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const groups = {
        active: programs.filter(item => normalizeStatus(item) === 'active'),
        paused: programs.filter(item => normalizeStatus(item) === 'paused'),
        draft: programs.filter(item => normalizeStatus(item) === 'draft'),
        archived: programs.filter(item => normalizeStatus(item) === 'archived')
    };

    counts.innerHTML = Object.entries(groups)
        .map(([status, list]) => `<span><strong>${list.length}</strong> ${STATUS_LABELS[status]}</span>`)
        .join('');

    if (!programs.length) {
        container.innerHTML = '<div class="programs-empty">No race plans have been created yet. Start with a race distance and Southbound will take you into the existing Race Plan Builder.</div>';
        return;
    }

    container.innerHTML = programs.map(program => {
        const status = normalizeStatus(program);
        const summary = getRaceSummary(program);
        const name = program.name || program.raceName || `${summary.type || 'Race'} Plan`;
        const duration = summary.weeks ? `${summary.weeks} wk` : '—';
        return `
            <article class="program-card">
                <div class="program-card-main">
                    <div>
                        <div class="program-card-top">
                            <span class="program-status ${status}">${STATUS_LABELS[status]}</span>
                            <span class="programs-kicker">${escapeHtml(String(summary.type).replace('_', ' '))}</span>
                        </div>
                        <h3>${escapeHtml(name)}</h3>
                        <div class="program-meta">
                            <span>${escapeHtml(formatDate(summary.start))} → ${escapeHtml(formatDate(summary.end))}</span>
                            <span>${duration}</span>
                            <span>Peak <strong>${escapeHtml(formatMiles(summary.peak))}${summary.peak ? ' mi' : ''}</strong></span>
                            <span>Goal <strong>${escapeHtml(summary.goal)}</strong></span>
                        </div>
                    </div>
                    <div class="program-card-actions">
                        <a class="program-card-link" href="running.html?section=race-plans">Open Race Plans</a>
                    </div>
                </div>
                ${coachNotesBadge('runningPrograms', program.id)}
            </article>
        `;
    }).join('');
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

function trainingCardActions(id, status) {
    const escId = escapeHtml(id);
    const edit = `<button type="button" class="program-card-link" data-training-edit="${escId}">Edit</button>`;
    const activate = `<button type="button" class="program-card-link" data-training-activate="${escId}">Activate</button>`;
    const pause = `<button type="button" class="program-card-link" data-training-pause="${escId}">Pause</button>`;
    const archive = `<button type="button" class="program-card-link program-card-danger" data-training-archive="${escId}">Archive</button>`;
    const del = `<button type="button" class="program-card-link program-card-danger" data-training-delete="${escId}">Delete</button>`;

    if (status === 'active') return `${pause}${archive}`;
    if (status === 'paused') return `${edit}${activate}${archive}`;
    if (status === 'archived') return `${activate}`;
    return `${edit}${activate}${del}`;
}

function renderTrainingLibrary() {
    const container = document.getElementById('trainingDraftLibrary');
    const counts = document.getElementById('trainingDraftCounts');
    if (!container || !counts) return;

    const plans = loadTrainingPrograms()
        .slice()
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const groups = {
        active: plans.filter(item => normalizeStatus(item) === 'active'),
        paused: plans.filter(item => normalizeStatus(item) === 'paused'),
        draft: plans.filter(item => normalizeStatus(item) === 'draft'),
        archived: plans.filter(item => normalizeStatus(item) === 'archived')
    };

    counts.innerHTML = Object.entries(groups)
        .map(([status, list]) => `<span><strong>${list.length}</strong> ${STATUS_LABELS[status]}</span>`)
        .join('');

    if (!plans.length) {
        container.innerHTML = '<div class="programs-empty">No training plans yet. Build one below and save it to keep it here.</div>';
        return;
    }

    container.innerHTML = plans.map(plan => {
        const status = normalizeStatus(plan);
        const settings = plan.settings || {};
        const generated = plan.generatedPlan;
        const name = plan.name || settings.name || 'Untitled training block';
        const goalLabel = GOAL_LABELS[settings.primaryGoal] || 'Training Plan';
        const dateRange = generated
            ? `${formatDate(generated.trainingStartDate)} → ${formatDate(generated.raceDate)}`
            : (settings.startDate && settings.endDate ? `${formatDate(settings.startDate)} → ${formatDate(settings.endDate)}` : 'Dates not set');
        const schedule = generated
            ? `${generated.runDaysPerWeek} runs · ${generated.liftDaysPerWeek} lifts · ${generated.crossDaysPerWeek} cross`
            : `${settings.runDays ?? 0} runs · ${settings.liftDays ?? 0} lifts · ${settings.crossDays ?? 0} cross`;
        const metrics = generated
            ? `<div class="program-meta"><span>${generated.totalWeeks} wk</span><span>Peak <strong>${escapeHtml(formatMiles(generated.generatedPeakMileage))} mi</strong></span><span>Long run <strong>${escapeHtml(formatMiles(generated.longestPlannedRun))} mi</strong></span></div>`
            : '';

        return `
            <article class="program-card">
                <div class="program-card-main">
                    <div>
                        <div class="program-card-top">
                            <span class="program-status ${status}">${STATUS_LABELS[status]}</span>
                            <span class="programs-kicker">${escapeHtml(goalLabel.toUpperCase())}</span>
                        </div>
                        <h3>${escapeHtml(name)}</h3>
                        <div class="program-meta">
                            <span>${escapeHtml(dateRange)}</span>
                            <span>${schedule}</span>
                        </div>
                        ${metrics}
                    </div>
                    <div class="program-card-actions">${trainingCardActions(plan.id, status)}</div>
                </div>
                ${coachNotesBadge('trainingPrograms', plan.id)}
            </article>
        `;
    }).join('');
}

async function activateTrainingPlan(id) {
    const programs = loadTrainingPrograms();
    const plan = programs.find(item => item.id === id);
    if (!plan) return;

    let result;
    try {
        result = generateTrainingPlan(plan.settings || {});
    } catch (error) {
        window.alert(error.message || 'This training plan could not be generated. Check its settings and try again.');
        return;
    }

    const { generatedPlan, warnings } = result;
    const conflicts = getTrainingPlanConflicts(generatedPlan.trainingStartDate, generatedPlan.raceDate, id);
    if (conflicts.length) {
        window.alert(`Southbound cannot activate this training plan yet because it overlaps an existing active plan:\n\n${formatConflictList(conflicts)}\n\nNothing was deleted or changed. Pause/archive the conflicting plan or change this plan's dates, then try again.`);
        return;
    }

    if (generatedPlan.liftDaysPerWeek > 0 && !getRacePlanStrengthAvailability().available) {
        const proceed = window.confirm('This plan schedules Strength sessions, but no current Strength plan was found.\n\nClick OK to activate without Strength calendar entries.\n\nClick Cancel to keep the plan inactive.');
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
        window.alert('The training plan was activated, but Southbound could not update the Strength calendar. Your existing Strength schedule was not deleted.');
    }

    renderTrainingLibrary();
    window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { programId: id, action: 'activated' } }));
    window.dispatchEvent(new CustomEvent('eddieos:running-programs-changed', { detail: { programId: id, action: 'activated' } }));
    window.dispatchEvent(new CustomEvent('eddieos:running-program-added', {
        detail: { programId: id, startDate: generatedPlan.trainingStartDate, raceDate: generatedPlan.raceDate, status: 'active' }
    }));

    const combinedWarnings = [...warnings, ...(strengthResult.warning ? [strengthResult.warning] : [])];
    window.alert(combinedWarnings.length
        ? `Training plan activated with notes:\n\n${combinedWarnings.map(item => `• ${item}`).join('\n')}`
        : 'Training plan activated. Check the Running and Strength calendars for the generated schedule.');
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

    renderTrainingLibrary();
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

function setTab(tabName, updateUrl = true) {
    const tab = TAB_NAMES[tabName] ? tabName : 'race';
    document.querySelectorAll('[data-program-tab]').forEach(button => {
        const active = button.dataset.programTab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-program-panel]').forEach(panel => {
        const active = panel.dataset.programPanel === tab;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
    });
    if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', url);
    }
    localStorage.setItem(TAB_KEY, tab);
}

function getSavedTab() {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (TAB_NAMES[urlTab]) return urlTab;
    try {
        const saved = localStorage.getItem(TAB_KEY);
        return TAB_NAMES[saved] ? saved : 'race';
    } catch {
        return 'race';
    }
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
    if (nextBtn) nextBtn.textContent = next === max ? 'Save Design' : 'Continue';
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

function init() {
    document.querySelectorAll('[data-program-tab]').forEach(button => {
        button.addEventListener('click', () => setTab(button.dataset.programTab));
    });

    document.querySelectorAll('[data-primary-goal]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-primary-goal]').forEach(item => item.classList.remove('selected'));
            button.classList.add('selected');
        });
    });

    const trainingNext = document.getElementById('trainingNext');
    const trainingBack = document.getElementById('trainingBack');
    let currentStep = 1;
    let editingDraftId = null;
    trainingNext?.addEventListener('click', () => {
        if (currentStep === 1 && !document.querySelector('[data-primary-goal].selected')) {
            window.alert('Choose a primary training goal first.');
            return;
        }
        if (currentStep === 2) {
            const start = document.getElementById('trainingStartDate')?.value;
            const end = document.getElementById('trainingEndDate')?.value;
            if (!start || !end || end < start) {
                window.alert('Choose a valid training start and end date.');
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
        const record = {
            id,
            name: draftSettings.name || 'Untitled training block',
            status: 'draft',
            createdAt: existingIndex >= 0 ? programs[existingIndex].createdAt : now,
            updatedAt: now,
            settings: draftSettings
        };
        if (existingIndex >= 0) {
            programs[existingIndex] = record;
        } else {
            programs.unshift(record);
        }
        editingDraftId = id;
        saveTrainingPrograms(programs).then(() => {
            renderTrainingLibrary();
            window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { id } }));
        });
        window.alert('Training plan draft saved. Find it in the list above.');
    });
    trainingBack?.addEventListener('click', () => {
        currentStep = Math.max(1, currentStep - 1);
        showTrainingStep(currentStep);
    });
    document.getElementById('trainingPlanReset')?.addEventListener('click', () => {
        editingDraftId = null;
        currentStep = 1;
        resetTrainingBuilder();
    });
    document.getElementById('trainingDraftLibrary')?.addEventListener('click', event => {
        const editBtn = event.target.closest('[data-training-edit]');
        const deleteBtn = event.target.closest('[data-training-delete]');
        const activateBtn = event.target.closest('[data-training-activate]');
        const pauseBtn = event.target.closest('[data-training-pause]');
        const archiveBtn = event.target.closest('[data-training-archive]');

        if (editBtn) {
            const draft = loadTrainingPrograms().find(item => item.id === editBtn.dataset.trainingEdit);
            if (!draft) return;
            editingDraftId = draft.id;
            applyTrainingSettings(draft.settings || {});
            currentStep = 1;
            showTrainingStep(1);
            return;
        }

        if (deleteBtn) {
            const id = deleteBtn.dataset.trainingDelete;
            if (!window.confirm('Delete this training plan draft?')) return;
            const remaining = loadTrainingPrograms().filter(item => item.id !== id);
            saveTrainingPrograms(remaining).then(() => {
                if (editingDraftId === id) {
                    editingDraftId = null;
                    currentStep = 1;
                    resetTrainingBuilder();
                }
                renderTrainingLibrary();
                window.dispatchEvent(new CustomEvent('eddieos:training-programs-changed', { detail: { id } }));
            });
            return;
        }

        if (activateBtn) {
            activateTrainingPlan(activateBtn.dataset.trainingActivate);
            return;
        }

        if (pauseBtn) {
            updateTrainingPlanStatus(pauseBtn.dataset.trainingPause, 'paused');
            return;
        }

        if (archiveBtn) {
            if (!window.confirm('Archive this training plan? It will come off the active calendar, but its history is kept.')) return;
            updateTrainingPlanStatus(archiveBtn.dataset.trainingArchive, 'archived');
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

    renderRaceLibrary();
    renderTrainingLibrary();
    resetTrainingBuilder();
    setTab(getSavedTab(), false);
}

window.addEventListener('storage', event => {
    if (event.key === 'running-programs') renderRaceLibrary();
    if (event.key === 'training-programs') renderTrainingLibrary();
});
window.addEventListener('eddieos:running-programs-changed', renderRaceLibrary);
window.addEventListener('eddieos:training-programs-changed', renderTrainingLibrary);

document.addEventListener('DOMContentLoaded', init, { once: true });
