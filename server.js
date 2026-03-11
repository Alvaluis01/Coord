const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors:{ origin:"*" }
});

io.on("connection", ()=>{
  console.log("UI conectada");
  emitServersUI();
});

app.use(express.json());
app.use(express.static("public"));

const port = 3000;

let totalTimeouts = 0;
let servers = {};
let backupCoordinators = []; // 🆕 Coordinadores registrados

function emitServersUI(){
    const now = Date.now();
    const formatted = {};

    Object.values(servers).forEach(s=>{
        const alive = now - s.lastPulse <= 15000;

        formatted[s.name]={
            status: alive ? "alive":"dead",
            url: s.url
        };
    });

    io.emit("servers", formatted);
}

let serverProcesses = {};
let nextPort = 4000;

// 🆕 RUTA RAÍZ - Sirve index.html
app.get("/", (req, res) => {
    res.sendFile(__dirname+"/index.html");
});

/* ⭐ RUTA UI */
app.get("/servers-ui",(req,res)=>{
  res.sendFile(__dirname+"/public/servers-ui.html");
});

httpServer.listen(port, () => {
  console.log(`Middleware is running on http://localhost:${port}`);
});


// Crear servidor
app.post("/create-server", (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Se requiere Nombre" });
    }

    const assignedPort = nextPort++;

    const process = spawn('node', ['miniServer.js', assignedPort, name], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (!fs.existsSync("logs")) {
        fs.mkdirSync("logs");
    }

    const logStream = fs.createWriteStream(`logs/${name}.log`, { flags: 'a' });

    process.stdout.pipe(logStream);
    process.stderr.pipe(logStream);

    serverProcesses[name] = {
        process,
        port: assignedPort
    };

    console.log(`Inicia '${name}' en http://localhost:${assignedPort}`);

    res.json({
        message: `Server '${name}' creado`,
        port: assignedPort
    });
});


// Registrar servidor (Worker)
app.post("/register", (req, res) => {
    const { name, url } = req.body;

    if (!name || !url) {
        return res.status(400).json({ error: "Se requiere Nombre y URL" });
    }

    servers[name] = {
        name,
        url,
        lastPulse: Date.now(),
        id: name
    };

    console.log(`Server registered: ${name}`);

    res.json({ message: "Server registrado correctamente" });

    emitServersUI();
});


// Pulso (Heartbeat)
app.post("/pulse/:name", (req, res) => {
    const { name } = req.params;

    if (servers[name]) {
        servers[name].lastPulse = Date.now();
        emitServersUI();
        return res.json({ message: "Pulso recibido" });
    }

    res.status(404).json({ error: "Servidor no registrado" });
});

// 🆕 Obtener servidores (formato para dashboard)
app.get("/servers", (req, res) => {
    const now = Date.now();
    const result = {};

    Object.values(servers).forEach(s => {
        result[s.name] = {
            id: s.name,
            url: s.url,
            lastPulse: s.lastPulse
        };
    });

    res.json(result);
});

// 🆕 Obtener métricas
app.get("/metrics", (req, res) => {
    const totalTracked = Object.keys(servers).length;
    const now = Date.now();
    const timeout = 15000;

    let activeServers = 0;
    Object.values(servers).forEach(s => {
        if (now - s.lastPulse <= timeout) {
            activeServers++;
        }
    });

    res.json({
        totalServers: totalTracked,
        activeServers: activeServers,
        totalTimeouts: totalTimeouts,
        backupCount: backupCoordinators.length
    });
});

// 🆕 Registrar coordinador backup
app.post("/register-backup", (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "Se requiere URL" });
    }

    if (!backupCoordinators.includes(url)) {
        backupCoordinators.push(url);
        console.log(`Coordinador registrado: ${url}`);
    }

    res.json({ message: "Coordinador registrado", url: url });
});

// 🆕 Obtener coordinadores
app.get("/backups", (req, res) => {
    res.json(backupCoordinators);
});

// 🆕 Forzar sincronización
app.post("/force-sync", (req, res) => {
    console.log("Sincronización forzada");
    emitServersUI();
    res.json({ message: "Sincronización enviada" });
});

// Detectar servidores muertos
setInterval(() => {
    const now = Date.now();
    const timeout = 15000;

    Object.keys(servers).forEach(name => {
        if (now - servers[name].lastPulse > timeout) {

            console.log(`Server muerto: ${name}`);

            totalTimeouts++;

            if (serverProcesses[name]) {
                serverProcesses[name].process.kill();
                delete serverProcesses[name];
            }

            delete servers[name];
            emitServersUI(); 
        }
    });
}, 10000);