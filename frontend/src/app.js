(function () {
  const { useEffect, useMemo, useState } = React;

  const api = {
    async request(path, options = {}) {
      const token = localStorage.getItem("ttm_token");
      const response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Something went wrong");
      return data;
    },
    signup(payload) {
      return this.request("/api/auth/signup", { method: "POST", body: JSON.stringify(payload) });
    },
    login(payload) {
      return this.request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    },
    dashboard() {
      return this.request("/api/dashboard");
    },
    users() {
      return this.request("/api/users");
    },
    projects() {
      return this.request("/api/projects");
    },
    createProject(payload) {
      return this.request("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    },
    updateTeam(projectId, memberIds) {
      return this.request(`/api/projects/${projectId}/team`, { method: "PATCH", body: JSON.stringify({ memberIds }) });
    },
    tasks() {
      return this.request("/api/tasks");
    },
    createTask(payload) {
      return this.request("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    },
    updateStatus(taskId, status) {
      return this.request(`/api/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    },
    deleteTask(taskId) {
      return this.request(`/api/tasks/${taskId}`, { method: "DELETE" });
    }
  };

  function AuthScreen({ onLogin }) {
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({ name: "", email: "admin@example.com", password: "admin123", role: "Admin" });
    const [error, setError] = useState("");

    async function submit(event) {
      event.preventDefault();
      setError("");
      try {
        const result = mode === "login" ? await api.login(form) : await api.signup(form);
        localStorage.setItem("ttm_token", result.token);
        onLogin(result.user);
      } catch (err) {
        setError(err.message);
      }
    }

    return React.createElement("main", { className: "auth-page" },
      React.createElement("section", { className: "auth-panel" },
        React.createElement("div", null,
          React.createElement("p", { className: "eyebrow" }, "Full-Stack Assignment"),
          React.createElement("h1", null, "Team Task Manager"),
          React.createElement("p", { className: "muted" }, "Create projects, assign work, and track team progress with Admin and Member access.")
        ),
        React.createElement("form", { onSubmit: submit, className: "auth-form" },
          React.createElement("div", { className: "tabs" },
            React.createElement("button", { type: "button", className: mode === "login" ? "active" : "", onClick: () => setMode("login") }, "Login"),
            React.createElement("button", { type: "button", className: mode === "signup" ? "active" : "", onClick: () => setMode("signup") }, "Signup")
          ),
          mode === "signup" && React.createElement("label", null, "Name",
            React.createElement("input", { value: form.name, onChange: e => setForm({ ...form, name: e.target.value }), placeholder: "Your name" })
          ),
          React.createElement("label", null, "Email",
            React.createElement("input", { type: "email", value: form.email, onChange: e => setForm({ ...form, email: e.target.value }), placeholder: "admin@example.com" })
          ),
          React.createElement("label", null, "Password",
            React.createElement("input", { type: "password", value: form.password, onChange: e => setForm({ ...form, password: e.target.value }), placeholder: "admin123" })
          ),
          mode === "signup" && React.createElement("label", null, "Role",
            React.createElement("select", { value: form.role, onChange: e => setForm({ ...form, role: e.target.value }) },
              React.createElement("option", null, "Member"),
              React.createElement("option", null, "Admin")
            )
          ),
          error && React.createElement("p", { className: "error" }, error),
          React.createElement("button", { className: "primary" }, mode === "login" ? "Login" : "Create Account"),
          React.createElement("p", { className: "hint" }, "Demo: admin@example.com / admin123 or member@example.com / member123")
        )
      )
    );
  }

  function StatCard({ label, value, tone }) {
    return React.createElement("article", { className: `stat ${tone || ""}` },
      React.createElement("span", null, label),
      React.createElement("strong", null, value)
    );
  }

  function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ dashboard: null, users: [], projects: [], tasks: [] });
    const [error, setError] = useState("");
    const [projectForm, setProjectForm] = useState({ name: "", description: "", memberIds: [] });
    const [taskForm, setTaskForm] = useState({ title: "", description: "", projectId: "", assignedTo: "", dueDate: "", priority: "Medium" });

    const isAdmin = user && user.role === "Admin";

    async function loadAll() {
      const [dashboard, users, projects, tasks] = await Promise.all([
        api.dashboard(),
        api.users(),
        api.projects(),
        api.tasks()
      ]);
      setData({ dashboard, users: users.users, projects: projects.projects, tasks: tasks.tasks });
      setTaskForm(current => ({
        ...current,
        projectId: current.projectId || (projects.projects[0] && projects.projects[0].id) || "",
        assignedTo: current.assignedTo || (users.users[0] && users.users[0].id) || ""
      }));
    }

    useEffect(() => {
      const token = localStorage.getItem("ttm_token");
      if (!token) {
        setLoading(false);
        return;
      }
      api.request("/api/auth/me")
        .then(result => {
          setUser(result.user);
          return loadAll();
        })
        .catch(() => localStorage.removeItem("ttm_token"))
        .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
      if (user) {
        loadAll().catch(err => setError(err.message));
      }
    }, [user && user.id]);

    const projectMembers = useMemo(() => {
      const selected = data.projects.find(project => project.id === taskForm.projectId);
      return selected ? selected.members : data.users;
    }, [data.projects, data.users, taskForm.projectId]);

    async function createProject(event) {
      event.preventDefault();
      setError("");
      try {
        await api.createProject(projectForm);
        setProjectForm({ name: "", description: "", memberIds: [] });
        await loadAll();
      } catch (err) {
        setError(err.message);
      }
    }

    async function createTask(event) {
      event.preventDefault();
      setError("");
      try {
        await api.createTask(taskForm);
        setTaskForm({ ...taskForm, title: "", description: "", dueDate: "" });
        await loadAll();
      } catch (err) {
        setError(err.message);
      }
    }

    async function updateStatus(taskId, status) {
      setError("");
      try {
        await api.updateStatus(taskId, status);
        await loadAll();
      } catch (err) {
        setError(err.message);
      }
    }

    async function deleteTask(taskId) {
      setError("");
      try {
        await api.deleteTask(taskId);
        await loadAll();
      } catch (err) {
        setError(err.message);
      }
    }

    function logout() {
      localStorage.removeItem("ttm_token");
      setUser(null);
    }

    if (loading) return React.createElement("div", { className: "loading" }, "Loading...");
    if (!user) return React.createElement(AuthScreen, { onLogin: setUser });

    const dashboard = data.dashboard || { total: 0, done: 0, inProgress: 0, overdue: 0, completion: 0, projects: [] };

    return React.createElement("div", { className: "app-shell" },
      React.createElement("header", { className: "topbar" },
        React.createElement("div", null,
          React.createElement("p", { className: "eyebrow" }, user.role),
          React.createElement("h1", null, "Team Task Manager")
        ),
        React.createElement("div", { className: "user-box" },
          React.createElement("span", null, user.name),
          React.createElement("button", { onClick: logout }, "Logout")
        )
      ),
      error && React.createElement("div", { className: "toast" }, error),
      React.createElement("section", { className: "stats-grid" },
        React.createElement(StatCard, { label: "Total Tasks", value: dashboard.total }),
        React.createElement(StatCard, { label: "In Progress", value: dashboard.inProgress, tone: "blue" }),
        React.createElement(StatCard, { label: "Completed", value: `${dashboard.completion}%`, tone: "green" }),
        React.createElement(StatCard, { label: "Overdue", value: dashboard.overdue, tone: "red" })
      ),
      React.createElement("main", { className: "content-grid" },
        React.createElement("section", { className: "panel wide" },
          React.createElement("div", { className: "panel-head" },
            React.createElement("h2", null, "Tasks"),
            React.createElement("span", null, `${data.tasks.length} shown`)
          ),
          React.createElement("div", { className: "task-list" },
            data.tasks.map(task => React.createElement("article", { key: task.id, className: "task-card" },
              React.createElement("div", null,
                React.createElement("h3", null, task.title),
                React.createElement("p", null, task.description || "No description"),
                React.createElement("div", { className: "meta" },
                  React.createElement("span", null, task.projectName),
                  React.createElement("span", null, task.assigneeName),
                  React.createElement("span", null, `Due ${task.dueDate}`),
                  React.createElement("span", { className: `priority ${task.priority.toLowerCase()}` }, task.priority)
                )
              ),
              React.createElement("div", { className: "task-actions" },
                React.createElement("select", { value: task.status, onChange: e => updateStatus(task.id, e.target.value) },
                  React.createElement("option", null, "Todo"),
                  React.createElement("option", null, "In Progress"),
                  React.createElement("option", null, "Done")
                ),
                isAdmin && React.createElement("button", { className: "danger", onClick: () => deleteTask(task.id) }, "Delete")
              )
            )),
            !data.tasks.length && React.createElement("p", { className: "empty" }, "No tasks available.")
          )
        ),
        React.createElement("aside", { className: "panel" },
          React.createElement("h2", null, "Project Progress"),
          dashboard.projects.map(project => React.createElement("div", { key: project.id, className: "progress-row" },
            React.createElement("div", null,
              React.createElement("strong", null, project.name),
              React.createElement("span", null, `${project.completedTasks}/${project.totalTasks} tasks`)
            ),
            React.createElement("div", { className: "progress" },
              React.createElement("div", { style: { width: `${project.progress}%` } })
            )
          )),
          !dashboard.projects.length && React.createElement("p", { className: "empty" }, "No projects yet.")
        ),
        isAdmin && React.createElement("section", { className: "panel" },
          React.createElement("h2", null, "Create Project"),
          React.createElement("form", { onSubmit: createProject, className: "stack-form" },
            React.createElement("input", { value: projectForm.name, onChange: e => setProjectForm({ ...projectForm, name: e.target.value }), placeholder: "Project name" }),
            React.createElement("textarea", { value: projectForm.description, onChange: e => setProjectForm({ ...projectForm, description: e.target.value }), placeholder: "Description" }),
            React.createElement("label", null, "Team Members",
              React.createElement("select", { multiple: true, value: projectForm.memberIds, onChange: e => setProjectForm({ ...projectForm, memberIds: Array.from(e.target.selectedOptions).map(option => option.value) }) },
                data.users.map(member => React.createElement("option", { key: member.id, value: member.id }, `${member.name} (${member.role})`))
              )
            ),
            React.createElement("button", { className: "primary" }, "Add Project")
          )
        ),
        isAdmin && React.createElement("section", { className: "panel" },
          React.createElement("h2", null, "Create Task"),
          React.createElement("form", { onSubmit: createTask, className: "stack-form" },
            React.createElement("input", { value: taskForm.title, onChange: e => setTaskForm({ ...taskForm, title: e.target.value }), placeholder: "Task title" }),
            React.createElement("textarea", { value: taskForm.description, onChange: e => setTaskForm({ ...taskForm, description: e.target.value }), placeholder: "Task description" }),
            React.createElement("select", { value: taskForm.projectId, onChange: e => setTaskForm({ ...taskForm, projectId: e.target.value }) },
              data.projects.map(project => React.createElement("option", { key: project.id, value: project.id }, project.name))
            ),
            React.createElement("select", { value: taskForm.assignedTo, onChange: e => setTaskForm({ ...taskForm, assignedTo: e.target.value }) },
              projectMembers.map(member => React.createElement("option", { key: member.id, value: member.id }, member.name))
            ),
            React.createElement("div", { className: "split" },
              React.createElement("input", { type: "date", value: taskForm.dueDate, onChange: e => setTaskForm({ ...taskForm, dueDate: e.target.value }) }),
              React.createElement("select", { value: taskForm.priority, onChange: e => setTaskForm({ ...taskForm, priority: e.target.value }) },
                React.createElement("option", null, "Low"),
                React.createElement("option", null, "Medium"),
                React.createElement("option", null, "High")
              )
            ),
            React.createElement("button", { className: "primary" }, "Assign Task")
          )
        )
      )
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
})();
