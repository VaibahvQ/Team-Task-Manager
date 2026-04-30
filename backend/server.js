const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 5000;
const ROOT = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
const STATUSES = ["Todo", "In Progress", "Done"];
const PRIORITIES = ["Low", "Medium", "High"];

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.copyFileSync(SEED_FILE, DB_FILE);
  }
}

function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function notFound(res) {
  sendJson(res, 404, { message: "Route not found" });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function authenticate(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = db.tokens.find(item => item.token === token);
  if (!session) return null;
  const user = db.users.find(item => item.id === session.userId);
  return user || null;
}

function requireUser(req, res, db) {
  const user = authenticate(req, db);
  if (!user) {
    sendJson(res, 401, { message: "Login required" });
    return null;
  }
  return user;
}

function requireAdmin(user, res) {
  if (user.role !== "Admin") {
    sendJson(res, 403, { message: "Admin access required" });
    return false;
  }
  return true;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function enrichTask(task, db) {
  const project = db.projects.find(item => item.id === task.projectId);
  const assignee = db.users.find(item => item.id === task.assignedTo);
  return {
    ...task,
    projectName: project ? project.name : "Unknown project",
    assigneeName: assignee ? assignee.name : "Unassigned"
  };
}

function visibleProjects(user, db) {
  if (user.role === "Admin") return db.projects;
  return db.projects.filter(project => project.memberIds.includes(user.id));
}

function visibleTasks(user, db) {
  if (user.role === "Admin") return db.tasks;
  const projectIds = new Set(visibleProjects(user, db).map(project => project.id));
  return db.tasks.filter(task => task.assignedTo === user.id || projectIds.has(task.projectId));
}

function isOverdue(task) {
  if (task.status === "Done" || !task.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${task.dueDate}T00:00:00`) < today;
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.normalize(path.join(FRONTEND_DIR, relativePath));

  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(FRONTEND_DIR, "index.html"), (indexError, indexContent) => {
        if (indexError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(indexContent);
      });
      return;
    }

    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".json": "application/json"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const db = readDb();

  try {
    if (method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = body.role === "Admin" ? "Admin" : "Member";

      if (name.length < 2) return sendJson(res, 400, { message: "Name must be at least 2 characters" });
      if (!validateEmail(email)) return sendJson(res, 400, { message: "Enter a valid email" });
      if (password.length < 6) return sendJson(res, 400, { message: "Password must be at least 6 characters" });
      if (db.users.some(user => user.email === email)) return sendJson(res, 409, { message: "Email already exists" });

      const user = {
        id: createId("u"),
        name,
        email,
        role,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      const token = createId("token");
      db.tokens.push({ token, userId: user.id, createdAt: new Date().toISOString() });
      writeDb(db);
      return sendJson(res, 201, { user: publicUser(user), token });
    }

    if (method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = db.users.find(item => item.email === email && item.passwordHash === hashPassword(password));
      if (!user) return sendJson(res, 401, { message: "Invalid email or password" });
      const token = createId("token");
      db.tokens.push({ token, userId: user.id, createdAt: new Date().toISOString() });
      writeDb(db);
      return sendJson(res, 200, { user: publicUser(user), token });
    }

    const user = requireUser(req, res, db);
    if (!user) return;

    if (method === "GET" && url.pathname === "/api/auth/me") {
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (method === "GET" && url.pathname === "/api/users") {
      return sendJson(res, 200, { users: db.users.map(publicUser) });
    }

    if (method === "GET" && url.pathname === "/api/projects") {
      const projects = visibleProjects(user, db).map(project => ({
        ...project,
        owner: publicUser(db.users.find(item => item.id === project.ownerId) || {}),
        members: project.memberIds.map(id => db.users.find(item => item.id === id)).filter(Boolean).map(publicUser),
        taskCount: db.tasks.filter(task => task.projectId === project.id).length
      }));
      return sendJson(res, 200, { projects });
    }

    if (method === "POST" && url.pathname === "/api/projects") {
      if (!requireAdmin(user, res)) return;
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
      if (name.length < 3) return sendJson(res, 400, { message: "Project name must be at least 3 characters" });
      const validMemberIds = [...new Set([user.id, ...memberIds])].filter(id => db.users.some(member => member.id === id));
      const project = {
        id: createId("p"),
        name,
        description,
        ownerId: user.id,
        memberIds: validMemberIds,
        createdAt: new Date().toISOString()
      };
      db.projects.push(project);
      writeDb(db);
      return sendJson(res, 201, { project });
    }

    const teamMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/team$/);
    if (method === "PATCH" && teamMatch) {
      if (!requireAdmin(user, res)) return;
      const project = db.projects.find(item => item.id === teamMatch[1]);
      if (!project) return sendJson(res, 404, { message: "Project not found" });
      const body = await parseBody(req);
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
      project.memberIds = [...new Set([project.ownerId, ...memberIds])].filter(id => db.users.some(member => member.id === id));
      writeDb(db);
      return sendJson(res, 200, { project });
    }

    if (method === "GET" && url.pathname === "/api/tasks") {
      return sendJson(res, 200, { tasks: visibleTasks(user, db).map(task => enrichTask(task, db)) });
    }

    if (method === "POST" && url.pathname === "/api/tasks") {
      if (!requireAdmin(user, res)) return;
      const body = await parseBody(req);
      const project = db.projects.find(item => item.id === body.projectId);
      const assignee = db.users.find(item => item.id === body.assignedTo);
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim();
      const status = STATUSES.includes(body.status) ? body.status : "Todo";
      const priority = PRIORITIES.includes(body.priority) ? body.priority : "Medium";
      const dueDate = String(body.dueDate || "").trim();

      if (!project) return sendJson(res, 400, { message: "Choose a valid project" });
      if (!assignee) return sendJson(res, 400, { message: "Choose a valid assignee" });
      if (!project.memberIds.includes(assignee.id)) return sendJson(res, 400, { message: "Assignee must belong to the project team" });
      if (title.length < 3) return sendJson(res, 400, { message: "Task title must be at least 3 characters" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return sendJson(res, 400, { message: "Due date is required" });

      const task = {
        id: createId("t"),
        projectId: project.id,
        title,
        description,
        assignedTo: assignee.id,
        status,
        priority,
        dueDate,
        createdBy: user.id,
        createdAt: new Date().toISOString()
      };
      db.tasks.push(task);
      writeDb(db);
      return sendJson(res, 201, { task: enrichTask(task, db) });
    }

    const taskStatusMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
    if (method === "PATCH" && taskStatusMatch) {
      const task = db.tasks.find(item => item.id === taskStatusMatch[1]);
      if (!task) return sendJson(res, 404, { message: "Task not found" });
      if (user.role !== "Admin" && task.assignedTo !== user.id) {
        return sendJson(res, 403, { message: "You can update only your assigned tasks" });
      }
      const body = await parseBody(req);
      if (!STATUSES.includes(body.status)) return sendJson(res, 400, { message: "Invalid status" });
      task.status = body.status;
      writeDb(db);
      return sendJson(res, 200, { task: enrichTask(task, db) });
    }

    const taskDeleteMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (method === "DELETE" && taskDeleteMatch) {
      if (!requireAdmin(user, res)) return;
      const index = db.tasks.findIndex(item => item.id === taskDeleteMatch[1]);
      if (index === -1) return sendJson(res, 404, { message: "Task not found" });
      db.tasks.splice(index, 1);
      writeDb(db);
      return sendJson(res, 200, { message: "Task deleted" });
    }

    if (method === "GET" && url.pathname === "/api/dashboard") {
      const tasks = visibleTasks(user, db);
      const total = tasks.length;
      const done = tasks.filter(task => task.status === "Done").length;
      const inProgress = tasks.filter(task => task.status === "In Progress").length;
      const overdue = tasks.filter(isOverdue).length;
      const byStatus = STATUSES.map(status => ({ status, count: tasks.filter(task => task.status === status).length }));
      const projects = visibleProjects(user, db).map(project => {
        const projectTasks = tasks.filter(task => task.projectId === project.id);
        const completed = projectTasks.filter(task => task.status === "Done").length;
        return {
          id: project.id,
          name: project.name,
          totalTasks: projectTasks.length,
          completedTasks: completed,
          progress: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0
        };
      });
      return sendJson(res, 200, {
        total,
        done,
        inProgress,
        overdue,
        completion: total ? Math.round((done / total) * 100) : 0,
        byStatus,
        projects
      });
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 400, { message: error.message || "Bad request" });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

ensureDatabase();
server.listen(PORT, () => {
  console.log(`Team Task Manager running at http://localhost:${PORT}`);
});
