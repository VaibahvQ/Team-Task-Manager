# Team Task Manager Full-Stack App

A simple full-stack project management app built with **React**, **Node.js REST APIs**, and a file-backed **NoSQL-style JSON database**.

## Features

- User signup and login
- Admin and Member roles
- Role-based access control
- Project creation and team member management
- Task creation, assignment, due dates, and status tracking
- Dashboard with total tasks, completion, overdue tasks, and project progress
- REST API backend with validations and relationships

## Tech Stack

- Frontend: React, HTML, CSS
- Backend: Node.js HTTP server
- Database: JSON document database stored in `backend/data/db.json`
- Auth: Token-based auth with hashed passwords

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:5000
```

## Demo Login

The app creates default users automatically on first run:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | admin123 |
| Member | member@example.com | member123 |

You can also create your own account from the signup screen.

## Project Structure

```text
team-task-manager-full-stack/
  backend/
    server.js
    data/
      seed.json
  frontend/
    index.html
    src/
      app.js
      styles.css
  package.json
  README.md
```

## Main API Routes

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Users

- `GET /api/users`

### Projects

- `GET /api/projects`
- `POST /api/projects` Admin only
- `PATCH /api/projects/:id/team` Admin only

### Tasks

- `GET /api/tasks`
- `POST /api/tasks` Admin only
- `PATCH /api/tasks/:id/status`
- `DELETE /api/tasks/:id` Admin only

### Dashboard

- `GET /api/dashboard`

## Role Rules

- Admin can create projects, manage project teams, create tasks, assign tasks, update any task, and delete tasks.
- Member can view assigned/team project tasks and update status for tasks assigned to them.

## Notes for GitHub Submission

This project has no external npm dependencies, so it is easy to run after cloning:

```bash
git clone <your-repo-url>
cd team-task-manager-full-stack
npm start
```

