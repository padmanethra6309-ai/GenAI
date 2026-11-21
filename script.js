const loginPanel = document.getElementById("loginPanel");
const appPanel = document.getElementById("appPanel");
let activeUserKey = "guest";
let activeHistoryTab = "recent";
let chatHistory = [];
let dashboardCurrentTasks = [];
let dashboardCurrentUsers = [];

function readActivity() {
	try {
		const activity = JSON.parse(localStorage.getItem(`contentflow:${activeUserKey}`)) || {};
		return { tasks: [], drafts: [], deleted: [], downloads: 0, downloadHistory: [], ...activity };
	} catch (_) { return { tasks: [], drafts: [], deleted: [], downloads: 0, downloadHistory: [] }; }
}

function saveActivity(activity) {
	localStorage.setItem(`contentflow:${activeUserKey}`, JSON.stringify(activity));
	renderDashboard();
	renderHistory();
}

function renderDashboard() {
	const activity = readActivity();
	const tasks = activity.tasks || [];
	renderGeneratedContent(tasks);
	const range = document.getElementById("dashboardDateRange")?.value || "30";
	const now = new Date();
	const currentStart = new Date(now);
	currentStart.setHours(0, 0, 0, 0);
	const days = range === "all" ? null : Number(range);
	if (days) currentStart.setDate(currentStart.getDate() - days + 1);
	const previousStart = days ? new Date(currentStart.getTime() - days * 86400000) : null;
	const timestampOf = task => task.timestamp ? new Date(task.timestamp) : null;
	const currentTasks = days ? tasks.filter(task => { const date = timestampOf(task); return date && date >= currentStart && date <= now; }) : tasks;
	dashboardCurrentTasks = currentTasks;
	const previousTasks = days ? tasks.filter(task => { const date = timestampOf(task); return date && date >= previousStart && date < currentStart; }) : [];
	const successfulCount = list => list.filter(task => !task.status || task.status === "Completed" || task.status === "Approved").length;
	const translationCount = list => list.filter(task => task.type === "Translation").length;
	const setTrend = (id, current, previous) => {
		const badge = document.getElementById(id);
		if (!days) { badge.textContent = "All time"; badge.className = "stat-trend neutral"; return; }
		if (!previous && current) { badge.textContent = "New"; badge.className = "stat-trend positive"; return; }
		const change = previous ? Math.round((current - previous) / previous * 100) : 0;
		badge.textContent = `${change > 0 ? "+" : ""}${change}%`;
		badge.className = `stat-trend ${change > 0 ? "positive" : change < 0 ? "negative" : "neutral"}`;
	};
	document.getElementById("statTotal").textContent = currentTasks.length;
	document.getElementById("statTranslations").textContent = translationCount(currentTasks);
	const successful = successfulCount(currentTasks);
	document.getElementById("statApproved").textContent = successful;
	document.getElementById("statDownloads").textContent = activity.downloads || 0;
	const savedMinutes = successful * 15;
	document.getElementById("statTimeSaved").textContent = savedMinutes >= 60 ? `${(savedMinutes / 60).toFixed(1)} hrs` : `${savedMinutes} min`;
	setTrend("trendTotal", currentTasks.length, previousTasks.length);
	setTrend("trendSuccessful", successful, successfulCount(previousTasks));
	setTrend("trendTranslations", translationCount(currentTasks), translationCount(previousTasks));
	setTrend("trendSaved", savedMinutes, successfulCount(previousTasks) * 15);
	const activeUsers = [];
	try {
		for (const key of Object.keys(localStorage)) {
			if (!key.startsWith("contentflow:")) continue;
			const userActivity = JSON.parse(localStorage.getItem(key) || "{}");
			const userTasks = Array.isArray(userActivity.tasks) ? userActivity.tasks : [];
			const matchingTasks = userTasks.filter(task => {
				if (!days) return true;
				const date = timestampOf(task);
				return date && date >= currentStart && date <= now;
			});
			if (matchingTasks.length) activeUsers.push({ username: key.slice("contentflow:".length), count: matchingTasks.length });
		}
	} catch (_) { activeUsers.length = 0; }
	if (!activeUsers.some(user => user.username === activeUserKey)) activeUsers.unshift({ username: activeUserKey, count: currentTasks.length });
	dashboardCurrentUsers = activeUsers;
	document.getElementById("statActiveUsers").textContent = activeUsers.length;
	const recentRows = document.getElementById("recentRows");
	if (recentRows) recentRows.innerHTML = currentTasks.length ? currentTasks.slice(0, 5).map(task => `<tr><td>${escapeHtml(task.type || "General")}</td><td>${escapeHtml(task.detail || "")}</td><td><span class="status-pill ${task.status === "Approved" ? "approved" : "complete"}">${escapeHtml(task.status || "Completed")}</span></td><td>${escapeHtml(task.time || (task.timestamp ? new Date(task.timestamp).toLocaleString() : "—"))}</td><td><button class="row-menu" data-open-history type="button" aria-label="Open transformation history">↗</button></td></tr>`).join("") : '<tr class="empty-row"><td colspan="5">No transformations in this period. Create your first piece of content.</td></tr>';
	renderDashboardTrend(tasks);
	renderContentDistribution(currentTasks);
	renderAnalytics(tasks);
}

function renderDashboardTrend(tasks) {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
	const counts = Array(7).fill(0);
	tasks.forEach(task => {
		if (!task.timestamp) return;
		const date = new Date(task.timestamp);
		date.setHours(0, 0, 0, 0);
		const day = Math.round((date - start) / 86400000);
		if (day >= 0 && day < 7) counts[day] += 1;
	});
	const scale = Math.max(8, Math.ceil(Math.max(...counts) / 2) * 2);
	document.querySelector(".trend-y-axis").innerHTML = [4, 3, 2, 1, 0].map(n => `<span>${Math.round(scale * n / 4)}</span>`).join("");
	const points = counts.map((count, index) => `${index * (700 / 6)},${170 - count / scale * 150}`);
	document.getElementById("activityLine").setAttribute("d", `M${points.join(" L")}`);
	document.getElementById("activityArea").setAttribute("d", `M0 170 L${points.join(" L")} L700 170 Z`);
	document.getElementById("activityPoints").innerHTML = points.map(point => {
		const [cx, cy] = point.split(",");
		return `<circle cx="${cx}" cy="${cy}" r="4"/>`;
	}).join("");
}

function renderContentDistribution(tasks) {
	const groups = [
		{ label: "Text Rewriting", color: "#8a4ff1", count: 0 },
		{ label: "Translation", color: "#25b8b1", count: 0 },
		{ label: "Social Post", color: "#f4a633", count: 0 },
		{ label: "Summarization", color: "#428cf4", count: 0 },
		{ label: "Others", color: "#cfd5df", count: 0 },
	];
	tasks.forEach(task => {
		const detail = (task.detail || "").toLowerCase();
		const index = task.type === "Translation" ? 1 : task.type === "Social media" ? 2 : detail.includes("summar") ? 3 : task.type === "General" && !detail.includes("quiz") ? 0 : 4;
		groups[index].count += 1;
	});
	const total = tasks.length;
	document.getElementById("distributionTotal").textContent = total;
	let angle = 0;
	const slices = groups.map(group => {
		const start = angle;
		angle += total ? group.count / total * 360 : 0;
		return `${group.color} ${start}deg ${angle}deg`;
	});
	document.getElementById("contentDonut").style.background = total ? `conic-gradient(${slices.join(",")})` : "conic-gradient(#e8ebf1 0deg 360deg)";
	document.getElementById("contentLegend").innerHTML = groups.map(group => {
		const percent = total ? Math.round(group.count / total * 100) : 0;
		return `<div class="legend-row"><i style="background:${group.color}"></i><span>${group.label}</span><strong>${percent}%</strong></div>`;
	}).join("");
}

function openMetricDetails(metric) {
	const activity = readActivity();
	const tasks = dashboardCurrentTasks;
	const period = document.getElementById("dashboardDateRange").selectedOptions[0].textContent;
	const modal = document.getElementById("metricModal");
	const title = document.getElementById("metricModalTitle");
	const summary = document.getElementById("metricModalSummary");
	const content = document.getElementById("metricModalContent");
	let entries = [];
	if (metric === "total") {
		title.textContent = "Total Transformations";
		summary.textContent = `${tasks.length} transformation${tasks.length === 1 ? "" : "s"} in ${period.toLowerCase()}.`;
		entries = tasks.map(task => ({ heading: task.detail || "Transformation", meta: `${task.type || "General"} · ${task.status || "Completed"}`, time: task.time || (task.timestamp ? new Date(task.timestamp).toLocaleString() : "") }));
	} else if (metric === "successful") {
		const successful = tasks.filter(task => !task.status || task.status === "Completed" || task.status === "Approved");
		title.textContent = "Successful Outputs";
		summary.textContent = `${successful.length} completed output${successful.length === 1 ? "" : "s"} in ${period.toLowerCase()}.`;
		entries = successful.map(task => ({ heading: task.detail || "Completed output", meta: task.type || "General", time: task.time || (task.timestamp ? new Date(task.timestamp).toLocaleString() : "") }));
	} else if (metric === "translations") {
		const translations = tasks.filter(task => task.type === "Translation");
		title.textContent = "Translations";
		summary.textContent = `${translations.length} translation${translations.length === 1 ? "" : "s"} in ${period.toLowerCase()}.`;
		entries = translations.map(task => ({ heading: task.detail || "Translation", meta: task.status || "Completed", time: task.time || (task.timestamp ? new Date(task.timestamp).toLocaleString() : "") }));
	} else if (metric === "downloads") {
		const downloads = activity.downloadHistory || [];
		title.textContent = "Downloads";
		summary.textContent = `${activity.downloads || 0} downloaded file${activity.downloads === 1 ? "" : "s"} recorded.`;
		entries = downloads.slice(0, 50).map(item => ({ heading: item.detail || "Transformed content", meta: "Downloaded file", time: item.timestamp ? new Date(item.timestamp).toLocaleString() : "" }));
		if ((activity.downloads || 0) > downloads.length) summary.textContent += ` ${activity.downloads - downloads.length} earlier download${activity.downloads - downloads.length === 1 ? "" : "s"} have totals only.`;
	} else if (metric === "saved") {
		const successful = tasks.filter(task => !task.status || task.status === "Completed" || task.status === "Approved");
		const minutes = successful.length * 15;
		title.textContent = "Estimated Time Saved";
		summary.textContent = `${successful.length} successful output${successful.length === 1 ? "" : "s"} × 15 minutes = ${minutes >= 60 ? `${(minutes / 60).toFixed(1)} hours` : `${minutes} minutes`} estimated.`;
		entries = successful.map(task => ({ heading: task.detail || "Completed output", meta: "15 minutes estimated", time: task.time || (task.timestamp ? new Date(task.timestamp).toLocaleString() : "") }));
	} else if (metric === "users") {
		title.textContent = "Active Users";
		summary.textContent = `${dashboardCurrentUsers.length} account${dashboardCurrentUsers.length === 1 ? "" : "s"} with activity recorded in this browser during ${period.toLowerCase()}.`;
		entries = dashboardCurrentUsers.map(user => ({ heading: user.username === activeUserKey ? `${user.username} (you)` : user.username, meta: `${user.count} transformation${user.count === 1 ? "" : "s"}`, time: "This browser" }));
	}
	content.innerHTML = entries.length
		? `<ul class="metric-detail-list">${entries.map(item => `<li><div><strong>${escapeHtml(item.heading)}</strong><span>${escapeHtml(item.meta)}</span></div><time>${escapeHtml(item.time)}</time></li>`).join("")}</ul>`
		: '<p class="metric-empty">No individual records for this metric yet.</p>';
	modal.hidden = false;
	document.getElementById("closeMetricModal").focus();
}

function closeMetricDetails() {
	document.getElementById("metricModal").hidden = true;
}

function renderAnalytics(tasks = readActivity().tasks) {
	const axis = document.getElementById("weeklyYAxis");
	const bars = document.getElementById("weeklyBars");
	if (!axis || !bars) return;
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
	const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const counts = Array(7).fill(0);
	tasks.forEach(task => {
		const timestamp = task.timestamp ? new Date(task.timestamp) : null;
		if (!timestamp || Number.isNaN(timestamp.getTime())) return;
		timestamp.setHours(0, 0, 0, 0);
		const offset = Math.round((timestamp - start) / 86400000);
		if (offset >= 0 && offset < 7) counts[offset] += 1;
	});
	const scale = Math.max(9, Math.ceil(Math.max(...counts) / 9) * 9);
	axis.innerHTML = [4, 3, 2, 1, 0].map(step => `<span>${Math.round(scale * step / 4)}</span>`).join("");
	bars.innerHTML = counts.map((count, index) => {
		const height = Math.max(0, count / scale * 100);
		return `<div class="week-day"><div class="week-bar-column"><div class="week-bar" style="height:${height}%" title="${days[index]}: ${count} transformations"></div></div><span>${days[index]}</span></div>`;
	}).join("");
}

function renderGeneratedContent(tasks = readActivity().tasks) {
	const rows = document.getElementById("generateRows");
	if (!rows) return;
	const typeFilter = document.getElementById("generateTypeFilter").value;
	const statusFilter = document.getElementById("generateStatusFilter").value;
	const filtered = tasks.filter(task => (typeFilter === "all" || task.type === typeFilter) && (statusFilter === "all" || (task.status || "Completed") === statusFilter));
	document.getElementById("generateCount").textContent = `(${tasks.length})`;
	if (!filtered.length) {
		rows.innerHTML = `<tr class="empty-row"><td colspan="7">${tasks.length ? "No content matches these filters." : "Your generated content will appear here."}</td></tr>`;
		return;
	}
	rows.innerHTML = filtered.slice(0, 10).map(task => {
		const date = task.timestamp ? new Date(task.timestamp) : null;
		const created = date ? date.toLocaleDateString() : "—";
		const modified = date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
		return `<tr><td><input type="checkbox" aria-label="Select ${escapeHtml(task.detail)}"></td><td>${escapeHtml(task.detail || "Generated content")}</td><td>${escapeHtml(task.type || "General")}</td><td>${escapeHtml(created)}</td><td>${escapeHtml(modified)}</td><td><span class="status-pill ${task.status === "Approved" ? "approved" : "complete"}">${escapeHtml(task.status || "Completed")}</span></td><td><button class="row-menu" type="button" aria-label="More actions">···</button></td></tr>`;
	}).join("");
}

function renderHistory() {
	const activity = readActivity();
	const tasks = activity.tasks || [];
	const drafts = activity.drafts || [];
	const deleted = activity.deleted || [];
	document.getElementById("recentCount").textContent = tasks.length;
	document.getElementById("incompleteCount").textContent = drafts.length;
	document.getElementById("deletedCount").textContent = deleted.length;
	const rows = document.getElementById("historyRows");
	if (!rows) return;
	let items = [];
	if (activeHistoryTab === "recent") {
		items = tasks.map(task => ({ ...task, category: "task", status: task.status || "Completed" }));
	} else if (activeHistoryTab === "incomplete") {
		items = drafts.map(draft => ({ ...draft, category: "draft", type: "Draft", detail: draft.detail || "Unfinished transformation", status: "Incomplete", timestamp: draft.updatedAt }));
	} else {
		items = deleted.map(task => ({ ...task, category: "deleted", status: "Deleted", timestamp: task.deletedAt || task.timestamp }));
	}
	if (!items.length) {
		const emptyText = activeHistoryTab === "recent" ? "No completed transformations yet." : activeHistoryTab === "incomplete" ? "No incomplete drafts. Save content from the Transformer to continue later." : "Deleted items will appear here.";
		rows.innerHTML = `<tr class="empty-row"><td colspan="5">${emptyText}</td></tr>`;
		return;
	}
	rows.innerHTML = items.map(item => {
		const whenValue = item.category === "deleted" ? item.deletedAt : item.category === "draft" ? item.updatedAt : item.time || item.timestamp;
		const when = whenValue ? (item.time && item.category === "task" ? item.time : new Date(whenValue).toLocaleString()) : "—";
		const actions = item.category === "task"
			? `<button class="secondary history-action" data-history-action="delete-task" data-id="${escapeHtml(item.id)}" type="button">Move to deleted</button>`
			: item.category === "draft"
				? `<button class="secondary history-action" data-history-action="open-draft" data-id="${escapeHtml(item.id)}" type="button">Continue</button><button class="secondary history-action" data-history-action="delete-draft" data-id="${escapeHtml(item.id)}" type="button">Delete</button>`
				: `<button class="secondary history-action" data-history-action="restore-task" data-id="${escapeHtml(item.id)}" type="button">Restore</button><button class="secondary history-action" data-history-action="purge-task" data-id="${escapeHtml(item.id)}" type="button">Delete forever</button>`;
		return `<tr><td>${escapeHtml(item.type || "General")}</td><td>${escapeHtml(item.detail || "")}</td><td><span class="status-pill">${escapeHtml(item.status)}</span></td><td>${escapeHtml(when)}</td><td class="history-actions">${actions}</td></tr>`;
	}).join("");
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function showView(viewId) {
	document.querySelectorAll(".view-panel").forEach(view => { view.hidden = view.id !== viewId; });
	document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === viewId));
	document.getElementById("pageTitle").textContent = ({ dashboardView: "Dashboard", transformerView: "Transform", aiAgentView: "AI Agent", analyticsView: "Analytics", historyView: "Transformation History" })[viewId] || "Workspace";
}

async function api(path, options = {}) {
	const response = await fetch(path, {
		...options,
		headers: { "Content-Type": "application/json", ...(options.headers || {}) },
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.error || "Request failed");
	return data;
}

function appendChatMessage(role, content) {
	const messages = document.getElementById("chatMessages");
	const bubble = document.createElement("div");
	bubble.className = `chat-message ${role === "user" ? "user-message" : "assistant-message"}`;
	const label = document.createElement("strong");
	label.textContent = role === "user" ? "You" : "AI Agent";
	const text = document.createElement("p");
	text.textContent = content;
	bubble.append(label, text);
	messages.appendChild(bubble);
	messages.scrollTop = messages.scrollHeight;
	return bubble;
}

document.getElementById("assistantChatForm").addEventListener("submit", async event => {
	event.preventDefault();
	const input = document.getElementById("chatInput");
	const sendButton = document.getElementById("chatSendButton");
	const status = document.getElementById("chatStatus");
	const message = input.value.trim();
	if (!message) return;
	chatHistory.push({ role: "user", content: message });
	appendChatMessage("user", message);
	input.value = "";
	sendButton.disabled = true;
	status.textContent = "AI Agent is thinking…";
	const pending = appendChatMessage("assistant", "Thinking…");
	try {
		const result = await api("/api/chat", {
			method: "POST",
			body: JSON.stringify({ message, history: chatHistory.slice(-13, -1) }),
		});
		pending.querySelector("p").textContent = result.answer;
		chatHistory.push({ role: "assistant", content: result.answer });
		status.textContent = "";
	} catch (error) {
		pending.querySelector("p").textContent = error.message;
		status.textContent = "Try again when the AI service is available.";
		if (error.message === "Authentication required") {
			loginPanel.hidden = false;
			appPanel.hidden = true;
		}
	} finally {
		sendButton.disabled = false;
		input.focus();
	}
});

function showError(target, error) {
	target.textContent = error.message;
}

function showApp(user) {
	loginPanel.hidden = true;
	appPanel.hidden = false;
	const isAdmin = user.role === "admin";
	activeUserKey = user.username;
	chatHistory = [];
	const chatMessages = document.getElementById("chatMessages");
	chatMessages.replaceChildren();
	appendChatMessage("assistant", "Hi! What would you like to know?");
	document.getElementById("accountLabel").textContent = isAdmin ? "Admin" : user.username;
	document.getElementById("manageUsersButton").hidden = !isAdmin;
	document.getElementById("sidebarManageUsers").hidden = !isAdmin;
	document.getElementById("adminPanel").hidden = true;
	showView("dashboardView");
	renderDashboard();
}

async function restoreSession() {
	try {
		const data = await api("/api/session");
		showApp(data.user);
	} catch (_) {
		loginPanel.hidden = false;
		appPanel.hidden = true;
	}
}

document.getElementById("loginForm").addEventListener("submit", async (event) => {
	event.preventDefault();
	const message = document.getElementById("loginMessage");
	const formElement = event.currentTarget;
	message.textContent = "";
	const form = new FormData(formElement);
	try {
		const data = await api("/api/login", {
			method: "POST",
			body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
		});
		formElement.reset();
		showApp(data.user);
	} catch (error) { showError(message, error); }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
	try { await api("/api/logout", { method: "POST" }); } finally {
		appPanel.hidden = true;
		loginPanel.hidden = false;
	}
});

document.getElementById("manageUsersButton").addEventListener("click", () => {
	showView("transformerView");
	document.getElementById("adminPanel").hidden = false;
	document.getElementById("manageUsersButton").hidden = true;
});

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-prompt-option]").forEach(button => button.addEventListener("click", () => {
	transformationSelect.value = button.dataset.promptOption;
	transformationSelect.dispatchEvent(new Event("change"));
	document.querySelectorAll(".category-options button").forEach(item => item.classList.toggle("selected", item === button));
}));
document.querySelectorAll("[data-social-format]").forEach(button => button.addEventListener("click", () => {
	transformationSelect.value = "social";
	document.getElementById("socialFormat").value = button.dataset.socialFormat;
	transformationSelect.dispatchEvent(new Event("change"));
	document.querySelectorAll(".category-options button").forEach(item => item.classList.toggle("selected", item === button));
	document.getElementById("socialOptions").hidden = false;
	showSocialStep(1);
}));
document.querySelector("[data-social-toggle]").addEventListener("click", () => {
	transformationSelect.value = "social";
	transformationSelect.dispatchEvent(new Event("change"));
	document.querySelectorAll(".category-options button").forEach(item => item.classList.remove("selected"));
	document.querySelector('[data-social-format="' + document.getElementById("socialFormat").value + '"]').classList.add("selected");
	showSocialStep(1);
});
document.querySelectorAll("[data-platform-choice]").forEach(button => button.addEventListener("click", () => {
	document.getElementById("platform").value = button.dataset.platformChoice;
	document.querySelectorAll("[data-platform-choice]").forEach(item => item.classList.toggle("selected", item === button));
}));
function showSocialStep(step) {
	document.querySelectorAll("[data-social-step]").forEach(panel => { panel.hidden = Number(panel.dataset.socialStep) !== step; });
	document.getElementById("socialStepLabel").textContent = `Step ${step} of 2`;
	document.getElementById("socialStepProgress").textContent = `${Math.round(step / 2 * 100)}% completed`;
	document.querySelectorAll(".wizard-progress i").forEach((bar, index) => bar.classList.toggle("complete", index < step));
}
document.getElementById("socialContinueStep1").addEventListener("click", () => showSocialStep(2));
document.querySelectorAll("[data-social-back]").forEach(button => button.addEventListener("click", () => showSocialStep(Number(button.dataset.socialBack))));
document.getElementById("socialWizardDone").addEventListener("click", () => transformContent("general"));
document.querySelector('[data-platform-choice="LinkedIn"]').classList.add("selected");
document.getElementById("generateTypeFilter").addEventListener("change", () => renderGeneratedContent());
document.getElementById("generateStatusFilter").addEventListener("change", () => renderGeneratedContent());
document.getElementById("newContentButton").addEventListener("click", () => document.getElementById("inputText").focus());
document.getElementById("dashboardDateRange").addEventListener("change", renderDashboard);
document.querySelectorAll(".metric-card").forEach(card => {
	card.addEventListener("click", () => openMetricDetails(card.dataset.metric));
	card.addEventListener("keydown", event => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openMetricDetails(card.dataset.metric);
		}
	});
});
document.getElementById("closeMetricModal").addEventListener("click", closeMetricDetails);
document.getElementById("metricModal").addEventListener("click", event => {
	if (event.target.id === "metricModal") closeMetricDetails();
});
document.addEventListener("keydown", event => {
	if (event.key === "Escape" && !document.getElementById("metricModal").hidden) closeMetricDetails();
});
document.getElementById("dashboardGenerateButton").addEventListener("click", () => {
	const prompt = document.getElementById("dashboardPrompt").value.trim();
	showView("transformerView");
	document.getElementById("inputText").value = prompt;
	if (prompt) transformContent("general");
	else document.getElementById("inputText").focus();
});
document.getElementById("dashboardViewAllButton").addEventListener("click", () => showView("historyView"));
document.getElementById("recentRows").addEventListener("click", event => {
	if (event.target.closest("[data-open-history]")) showView("historyView");
});
document.querySelectorAll("[data-quick-option]").forEach(button => button.addEventListener("click", () => {
	const option = button.dataset.quickOption;
	showView("transformerView");
	if (option === "translate") {
		document.getElementById("targetLanguage").focus();
		return;
	}
	transformationSelect.value = option;
	transformationSelect.dispatchEvent(new Event("change"));
	if (option === "social") showSocialStep(1);
	document.getElementById("inputText").focus();
}));
document.querySelectorAll("[data-history-tab]").forEach(button => button.addEventListener("click", () => {
	activeHistoryTab = button.dataset.historyTab;
	document.querySelectorAll("[data-history-tab]").forEach(tab => {
		tab.classList.toggle("active", tab === button);
		tab.setAttribute("aria-selected", tab === button ? "true" : "false");
	});
	renderHistory();
}));
document.getElementById("historyRows").addEventListener("click", event => {
	const button = event.target.closest("[data-history-action]");
	if (!button) return;
	const activity = readActivity();
	const { historyAction, id } = button.dataset;
	if (historyAction === "delete-task") {
		const index = activity.tasks.findIndex(item => String(item.id) === id);
		if (index >= 0) activity.deleted.unshift({ ...activity.tasks.splice(index, 1)[0], itemKind: "task", deletedAt: new Date().toISOString() });
	} else if (historyAction === "delete-draft") {
		const index = activity.drafts.findIndex(item => String(item.id) === id);
		if (index >= 0) activity.deleted.unshift({ ...activity.drafts.splice(index, 1)[0], itemKind: "draft", deletedAt: new Date().toISOString() });
	} else if (historyAction === "restore-task") {
		const index = activity.deleted.findIndex(item => String(item.id) === id);
		if (index >= 0) {
			const [item] = activity.deleted.splice(index, 1);
			if (item.itemKind === "draft") activity.drafts.unshift(item);
			else activity.tasks.unshift(item);
		}
	} else if (historyAction === "purge-task") {
		activity.deleted = activity.deleted.filter(item => String(item.id) !== id);
	} else if (historyAction === "open-draft") {
		const draft = activity.drafts.find(item => String(item.id) === id);
		if (draft) {
			document.getElementById("inputText").value = draft.text || "";
			transformationSelect.value = draft.option || "summary";
			transformationSelect.dispatchEvent(new Event("change"));
			activity.drafts = activity.drafts.filter(item => String(item.id) !== id);
			showView("transformerView");
		}
	}
	saveActivity(activity);
});
document.getElementById("saveDraftButton").addEventListener("click", () => {
	const text = document.getElementById("inputText").value.trim();
	const message = document.getElementById("draftMessage");
	if (!text) { message.textContent = "Add some content before saving an incomplete draft."; return; }
	const activity = readActivity();
	const timestamp = new Date().toISOString();
	activity.drafts.unshift({
		id: `${Date.now()}-${Math.random()}`,
		text,
		option: transformationSelect.value,
		detail: `Draft · ${transformationSelect.options[transformationSelect.selectedIndex].text}`,
		updatedAt: timestamp,
	});
	saveActivity(activity);
	message.textContent = "Saved to History → Incomplete.";
});
document.getElementById("sidebarManageUsers").addEventListener("click", () => {
	showView("transformerView");
	document.getElementById("adminPanel").hidden = false;
	document.getElementById("manageUsersButton").hidden = true;
});
document.getElementById("closeAdminPanel").addEventListener("click", () => {
	document.getElementById("adminPanel").hidden = true;
	document.getElementById("manageUsersButton").hidden = false;
});

document.getElementById("createUserForm").addEventListener("submit", async (event) => {
	event.preventDefault();
	const message = document.getElementById("createUserMessage");
	const formElement = event.currentTarget;
	message.textContent = "";
	const form = new FormData(formElement);
	try {
		const data = await api("/api/users", {
			method: "POST",
			body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
		});
		message.textContent = data.message;
		formElement.reset();
	} catch (error) { showError(message, error); }
});

document.getElementById("sourceFile").addEventListener("change", event => {
	const file = event.currentTarget.files[0];
	const extractButton = document.getElementById("uploadFileButton");
	const name = document.getElementById("uploadFileName");
	const message = document.getElementById("uploadMessage");
	message.textContent = "";
	if (file) {
		name.textContent = file.name;
		extractButton.hidden = false;
	} else {
		name.textContent = "PNG, JPG, PDF, DOCX, TXT, audio & video";
		extractButton.hidden = true;
	}
});

document.getElementById("uploadFileButton").addEventListener("click", async () => {
	const fileInput = document.getElementById("sourceFile");
	const message = document.getElementById("uploadMessage");
	const button = document.getElementById("uploadFileButton");
	const file = fileInput.files[0];
	message.textContent = "";
	message.classList.remove("success-message");
	if (!file) { message.textContent = "Choose a file to upload first."; return; }
	const formData = new FormData();
	formData.append("file", file);
	button.disabled = true;
	button.textContent = "Extracting...";
	message.textContent = "Processing your file. Please wait.";
	try {
		const response = await fetch("/api/extract", { method: "POST", body: formData });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Could not process this file.");
		document.getElementById("inputText").value = data.text;
		message.classList.add("success-message");
		message.textContent = `Content extracted from ${file.name}. Review it below, then choose a transformation.`;
	} catch (error) {
		message.textContent = error.message;
		if (error.message === "Authentication required") {
			loginPanel.hidden = false;
			appPanel.hidden = true;
		}
	} finally {
		button.disabled = false;
		button.textContent = "Extract content";
	}
});

document.getElementById("transformButton").addEventListener("click", () => {
	transformContent("general");
});
document.getElementById("translateButton").addEventListener("click", () => transformContent("translate"));
const languageSpeechCodes = {
	Arabic: "ar", Bengali: "bn", "Chinese (Simplified)": "zh-CN", "Chinese (Traditional)": "zh-TW",
	English: "en", French: "fr", German: "de", Hindi: "hi", Italian: "it", Japanese: "ja",
	Korean: "ko", Portuguese: "pt", Russian: "ru", Spanish: "es", Tamil: "ta", Telugu: "te", Urdu: "ur",
	Assamese: "as", Bodo: "brx", Dogri: "doi", Kashmiri: "ks", Konkani: "kok", Maithili: "mai",
	"Manipuri (Meitei)": "mni", Marathi: "mr", Nepali: "ne", Odia: "or", Punjabi: "pa", Sanskrit: "sa",
	Santali: "sat", Sindhi: "sd",
};
const speakTranslatedButton = document.getElementById("speakTranslatedButton");
const stopSpeechButton = document.getElementById("stopSpeechButton");
const speechMessage = document.getElementById("speechMessage");
speakTranslatedButton.addEventListener("click", async () => {
	if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
		speechMessage.textContent = "Speech playback is not supported in this browser.";
		return;
	}
	speakTranslatedButton.disabled = true;
	speechMessage.textContent = "Translating content before speech playback...";
	try {
		const result = await transformContent("translate", { speak: true });
		if (!result) { speakTranslatedButton.disabled = false; return; }
		const language = document.getElementById("targetLanguage").value;
		const utterance = new SpeechSynthesisUtterance(result);
		utterance.lang = languageSpeechCodes[language] || "en";
		const voice = speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(utterance.lang.toLowerCase()));
		if (voice) utterance.voice = voice;
		utterance.onstart = () => { speechMessage.textContent = `Speaking in ${language}...`; stopSpeechButton.disabled = false; };
		utterance.onend = () => { speechMessage.textContent = "Speech finished."; stopSpeechButton.disabled = true; speakTranslatedButton.disabled = false; };
		utterance.onerror = () => { speechMessage.textContent = "Speech playback could not be completed."; stopSpeechButton.disabled = true; speakTranslatedButton.disabled = false; };
		speechSynthesis.cancel();
		speechSynthesis.speak(utterance);
	} catch (_) {
		speechMessage.textContent = "Could not prepare speech for this content.";
		speakTranslatedButton.disabled = false;
	}
});
stopSpeechButton.addEventListener("click", () => {
	speechSynthesis.cancel();
	stopSpeechButton.disabled = true;
	speakTranslatedButton.disabled = false;
	speechMessage.textContent = "Speech stopped.";
});
const editOutputButton = document.getElementById("editOutputButton");
const saveOutputEditButton = document.getElementById("saveOutputEditButton");
const cancelOutputEditButton = document.getElementById("cancelOutputEditButton");
const downloadOutputButton = document.getElementById("downloadOutputButton");
const approvalMessage = document.getElementById("approvalMessage");
let outputReady = false;
let outputEditing = false;
let originalOutput = "";
let latestTransformMode = "general";
const copyOutputButton = document.getElementById("copyOutputButton");
const retryOutputButton = document.getElementById("retryOutputButton");

let activeQuiz = null;
let activeQuizIndex = 0;
let quizAnswers = [];
let quizSubmitted = false;

function parseQuiz(text) {
	const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
	const questions = [];
	let current = null;
	let inAnswerKey = false;
	for (const rawLine of lines) {
		const line = rawLine.replace(/^\*+|\*+$/g, "").trim();
		if (/^answer\s*key\s*:?$/i.test(line.replace(/^#+\s*/, ""))) { inAnswerKey = true; continue; }
		if (!inAnswerKey) {
			const question = line.match(/^(?:\*\*)?Question\s+(\d+)\s*[:.)-]\s*(.*?)(?:\*\*)?$/i);
			if (question) {
				current = { number: Number(question[1]), text: question[2], choices: [], hint: "", correct: "", explanation: "" };
				questions.push(current);
				continue;
			}
			const choice = line.match(/^([A-D])\s*[).:-]\s*(.*)$/i);
			if (choice && current) { current.choices.push({ letter: choice[1].toUpperCase(), text: choice[2] }); continue; }
			const hint = line.match(/^Hint\s*:\s*(.*)$/i);
			if (hint && current) current.hint = hint[1];
		} else {
			const answer = line.match(/^(?:Question\s*)?(\d+)\s*[).:-]\s*([A-D])\b\s*[-:.)]?\s*(.*)$/i)
				|| line.match(/^(\d+)\s*[-:.)]\s*([A-D])\b\s*(.*)$/i);
			if (answer) {
				const target = questions.find(item => item.number === Number(answer[1]));
				if (target) { target.correct = answer[2].toUpperCase(); target.explanation = answer[3].replace(/^[-:.)\s]+/, ""); }
			}
		}
	}
	return questions.length && questions.every(question => question.text && question.choices.length === 4 && question.correct) ? questions : null;
}

function renderQuizQuestion() {
	const output = document.getElementById("output");
	const question = activeQuiz[activeQuizIndex];
	const card = document.createElement("section");
	card.className = "interactive-quiz";
	card.setAttribute("aria-label", "Interactive quiz");
	const header = document.createElement("div");
	header.className = "quiz-card-header";
	const tabs = document.createElement("div");
	tabs.className = "quiz-mode-tabs";
	const quizTab = document.createElement("span"); quizTab.className = "active"; quizTab.textContent = "Quiz";
	const flashTab = document.createElement("span"); flashTab.textContent = "Flashcards";
	tabs.append(quizTab, flashTab);
	const count = document.createElement("span"); count.className = "quiz-count"; count.textContent = `Question ${activeQuizIndex + 1} of ${activeQuiz.length}`;
	header.append(tabs, count);
	const title = document.createElement("h2"); title.className = "quiz-question-title"; title.textContent = question.text;
	const choices = document.createElement("div"); choices.className = "quiz-choice-list";
	question.choices.forEach(choice => {
		const button = document.createElement("button"); button.type = "button"; button.className = "quiz-choice";
		button.setAttribute("aria-pressed", quizAnswers[activeQuizIndex] === choice.letter ? "true" : "false");
		if (quizSubmitted && choice.letter === question.correct) button.classList.add("correct");
		if (quizSubmitted && quizAnswers[activeQuizIndex] === choice.letter && choice.letter !== question.correct) button.classList.add("incorrect");
		const marker = document.createElement("span"); marker.className = "quiz-choice-marker"; marker.textContent = choice.letter;
		const label = document.createElement("span"); label.textContent = choice.text;
		button.append(marker, label);
		button.disabled = quizSubmitted;
		button.addEventListener("click", () => { quizAnswers[activeQuizIndex] = choice.letter; renderQuizQuestion(); });
		choices.append(button);
	});
	const hint = document.createElement("details"); hint.className = "quiz-hint";
	const hintTitle = document.createElement("summary"); hintTitle.textContent = "Show hint";
	const hintText = document.createElement("p"); hintText.textContent = question.hint || "Think about the key idea described in the source material.";
	hint.append(hintTitle, hintText);
	const footer = document.createElement("div"); footer.className = "quiz-footer";
	const navigation = document.createElement("div"); navigation.className = "quiz-navigation";
	activeQuiz.forEach((item, index) => {
		const button = document.createElement("button"); button.type = "button"; button.textContent = String(index + 1);
		button.setAttribute("aria-label", `Go to question ${index + 1}`);
		if (index === activeQuizIndex) button.classList.add("current");
		if (quizAnswers[index]) button.classList.add("answered");
		button.addEventListener("click", () => { activeQuizIndex = index; renderQuizQuestion(); });
		navigation.append(button);
	});
	const actions = document.createElement("div"); actions.className = "quiz-page-actions";
	if (!quizSubmitted) {
		const prev = document.createElement("button"); prev.type = "button"; prev.textContent = "Previous"; prev.disabled = activeQuizIndex === 0;
		prev.addEventListener("click", () => { activeQuizIndex--; renderQuizQuestion(); });
		const next = document.createElement("button"); next.type = "button"; next.textContent = activeQuizIndex === activeQuiz.length - 1 ? "Submit quiz" : "Next";
		next.disabled = !quizAnswers[activeQuizIndex];
		next.addEventListener("click", () => {
			if (activeQuizIndex < activeQuiz.length - 1) { activeQuizIndex++; renderQuizQuestion(); }
			else { quizSubmitted = true; renderQuizQuestion(); }
		});
		actions.append(prev, next);
	} else {
		const score = document.createElement("strong");
		const correctCount = activeQuiz.filter((item, index) => quizAnswers[index] === item.correct).length;
		score.textContent = `Your score: ${correctCount} / ${activeQuiz.length}`;
		const explanation = document.createElement("p"); explanation.className = "quiz-answer-explanation";
		explanation.textContent = `${question.correct}) ${question.explanation || "Correct answer."}`;
		actions.append(score, explanation);
	}
	footer.append(navigation, actions);
	card.append(header, title, choices, hint, footer);
	output.replaceChildren(card);
}

function setOutputReady(ready) {
	outputReady = ready;
	editOutputButton.disabled = !ready;
	copyOutputButton.disabled = !ready;
	retryOutputButton.disabled = !ready;
	downloadOutputButton.disabled = !ready;
	approvalMessage.textContent = "";
	if (!ready) endOutputEdit(false);
}

editOutputButton.addEventListener("click", () => {
	if (!outputReady || outputEditing) return;
	const output = document.getElementById("output");
	originalOutput = output.textContent;
	const editor = document.createElement("textarea");
	editor.id = "outputEditor";
	editor.setAttribute("aria-label", "Edit transformed content");
	editor.value = originalOutput;
	output.replaceChildren(editor);
	outputEditing = true;
	editOutputButton.hidden = true;
	copyOutputButton.disabled = true;
	retryOutputButton.disabled = true;
	downloadOutputButton.disabled = true;
	saveOutputEditButton.hidden = false;
	cancelOutputEditButton.hidden = false;
	approvalMessage.textContent = "Edit the transformed content, then save or cancel.";
	editor.focus();
});

function endOutputEdit(save) {
	if (!outputEditing) return;
	const output = document.getElementById("output");
	const editor = document.getElementById("outputEditor");
	output.textContent = save ? editor.value : originalOutput;
	outputEditing = false;
	editOutputButton.hidden = false;
	copyOutputButton.disabled = !outputReady;
	retryOutputButton.disabled = !outputReady;
	downloadOutputButton.disabled = !outputReady;
	saveOutputEditButton.hidden = true;
	cancelOutputEditButton.hidden = true;
	approvalMessage.textContent = save ? "Edits saved." : "Edits canceled.";
}

saveOutputEditButton.addEventListener("click", () => endOutputEdit(true));
cancelOutputEditButton.addEventListener("click", () => endOutputEdit(false));

copyOutputButton.addEventListener("click", async () => {
	if (!outputReady || outputEditing) return;
	const text = document.getElementById("output").textContent;
	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(text);
		} else {
			const copyField = document.createElement("textarea");
			copyField.value = text;
			copyField.style.position = "fixed";
			copyField.style.opacity = "0";
			document.body.appendChild(copyField);
			copyField.select();
			const copied = document.execCommand("copy");
			copyField.remove();
			if (!copied) throw new Error("Copy unavailable");
		}
		approvalMessage.textContent = "Copied to clipboard.";
	} catch (_) { approvalMessage.textContent = "Could not copy. Select the output and copy it manually."; }
});

retryOutputButton.addEventListener("click", () => {
	if (!outputReady || outputEditing) return;
	transformContent(latestTransformMode);
});

downloadOutputButton.addEventListener("click", () => {
	if (!outputReady || outputEditing) return;
	const content = document.getElementById("output").textContent;
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "transformed-content.txt";
	link.click();
	URL.revokeObjectURL(url);
	const activity = readActivity();
	activity.downloads = (activity.downloads || 0) + 1;
	activity.downloadHistory = activity.downloadHistory || [];
	activity.downloadHistory.unshift({ detail: activity.tasks?.[0]?.detail || "Transformed content", timestamp: new Date().toISOString() });
	activity.downloadHistory = activity.downloadHistory.slice(0, 200);
	saveActivity(activity);
});

const transformationSelect = document.getElementById("option");
const socialOptions = document.getElementById("socialOptions");
const quizOptions = document.getElementById("quizOptions");
transformationSelect.addEventListener("change", () => {
	socialOptions.hidden = transformationSelect.value !== "social";
	quizOptions.hidden = transformationSelect.value !== "quiz";
	document.getElementById("transformButton").hidden = transformationSelect.value === "social";
});

async function transformContent(mode, options = {}) {
	latestTransformMode = mode;
	const text = document.getElementById("inputText").value;
	const selectedOption = transformationSelect.value;
	const option = mode === "translate" ? "translate" : selectedOption;
	const output = document.getElementById("output");
	activeQuiz = null;
	quizAnswers = [];
	quizSubmitted = false;
	setOutputReady(false);
	if (!text.trim()) { output.textContent = "Please enter some content."; return; }
	output.textContent = "Processing... Please wait.";
	try {
		const settings = option === "quiz" ? {
			question_count: Number(document.getElementById("quizLength").value),
		} : option === "social" ? {
			platform: document.getElementById("platform").value,
			tone: document.getElementById("tone").value,
			format: document.getElementById("socialFormat").value,
			audience: document.getElementById("audience").value.trim(),
			length: document.getElementById("postLength").value,
			include_hashtags: document.getElementById("includeHashtags").checked,
			include_cta: document.getElementById("includeCta").checked,
			include_emoji: document.getElementById("includeEmoji").checked,
		} : option === "translate" ? {
			target_language: document.getElementById("targetLanguage").value,
		} : {};
		const data = await api("/transform", { method: "POST", body: JSON.stringify({ text, option, ...settings }) });
		if (option === "quiz") {
			activeQuiz = parseQuiz(data.result);
			activeQuizIndex = 0;
			if (activeQuiz) renderQuizQuestion();
			else {
				output.textContent = "Ollama did not return a valid quiz. Please retry or use a shorter, text-rich source section.";
				setOutputReady(false);
				return null;
			}
		} else output.textContent = data.result;
		setOutputReady(Boolean(data.result));
		if (data.result) {
			const activity = readActivity();
			const timestamp = new Date().toISOString();
			const contentGroups = {
				summary: ["General", "Summary"], simple: ["General", "Simple English"], professional: ["General", "Professional"],
				impressive: ["General", "Impressive rewrite"], bullets: ["General", "Bullet points"], quiz: ["General", `Quiz · ${settings.question_count} questions`],
				social: ["Social media", `${settings.platform || "Social"} ${(settings.format || "post").replace(/_/g, " ")}`],
				blog_outline: ["Blog", "Blog outline"], blog_intro: ["Blog", "Blog introduction"], blog_article: ["Blog", "Blog article"], blog_seo: ["Blog", "SEO rewrite"],
				marketing_copy: ["Marketing", "Marketing copy"], ad_copy: ["Marketing", "Ad copy"], product_description: ["Marketing", "Product description"], email_campaign: ["Marketing", "Marketing email"],
			};
			const contentMeta = contentGroups[option];
			const record = {
				id: `${Date.now()}-${Math.random()}`,
				type: option === "translate" ? "Translation" : contentMeta?.[0] || "General",
				detail: option === "translate" ? `Translated to ${settings.target_language}` : contentMeta?.[1] || option[0].toUpperCase() + option.slice(1),
				status: "Completed",
				timestamp,
				time: new Date(timestamp).toLocaleString(),
			};
			activity.tasks.unshift(record);
			activity.tasks = activity.tasks.slice(0, 100);
			saveActivity(activity);
		}
		if (options.speak) return data.result;
	} catch (error) {
		if (error.message === "Authentication required") {
			loginPanel.hidden = false;
			appPanel.hidden = true;
		}
		output.textContent = error.message;
		return null;
	}
}

restoreSession();
