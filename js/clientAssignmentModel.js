/* Southbound — direct client assignment search model */

export function normalizeClientSearch(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function filterAssignableClients(clients, rawQuery) {
    const query = normalizeClientSearch(rawQuery);
    if (!query) return [];

    return (clients || [])
        .filter(client => {
            const name = normalizeClientSearch(client.displayName);
            const email = normalizeClientSearch(client.email);
            return name.includes(query) || email.includes(query);
        })
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
}

export function displayNameForAssignment(client) {
    return String(client?.displayName || client?.email || "Client").trim() || "Client";
}