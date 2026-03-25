const express = require("express")
const cors = require("cors")

const app = express()
const PORT = 3002          // puerto distinto al primario (3000) y al backup (3001)
const TIMEOUT = 5000

app.use(cors())
app.use(express.json())
app.use(express.static(__dirname))

let servers = {}
let totalTimeouts = 0
let backups = []           // otros coordinadores conocidos (incluyendo el primario)

// envia el estado de workers a todos los coordinadores conocidos
async function replicateToBackups() {
    if (backups.length === 0) return

    var workerList = []
    for (var key in servers) {
        workerList.push(servers[key])
    }

    for (var i = 0; i < backups.length; i++) {
        var backupUrl = backups[i]
        try {
            await fetch(backupUrl + "/replicate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workers: workerList })
            })
        } catch (err) {
            console.log("[REPLICA] Fallo hacia " + backupUrl + ": " + err.message)
        }
    }
}


// Endpoints de workers (mismo contrato que el primario)
app.post("/register", (req, res) => {
    const { id, url } = req.body

    if (!id || !url) {
        return res.status(400).json({ error: "Se requiere id y url" })
    }

    servers[id] = {
        id,
        url,
        lastPulse: Date.now()
    }

    console.log(`[BACKUP-3] Worker registrado: ${id} en ${url}`)
    replicateToBackups()
    res.json({ message: "Servidor registrado exitosamente" })
})

app.post("/pulse", (req, res) => {
    const { id } = req.body

    if (!id) {
        return res.status(400).json({ error: "Se requiere id" })
    }

    if (!servers[id]) {
        return res.status(400).json({ error: "Servidor no encontrado" })
    }

    servers[id].lastPulse = Date.now()
    replicateToBackups()
    res.json({ message: "Pulso recibido" })
})


app.get("/servers", (req, res) => {
    res.json(servers)
})

app.get("/metrics", (req, res) => {
    const totalServers = Object.keys(servers).length
    res.json({
        totalServers,
        activeServers: totalServers,
        totalTimeouts,
        timestamp: Date.now(),
        isPrimary: false,
        backupCount: backups.length
    })
})

// Registrar coordinador conocido (primario u otro backup)
app.post("/register-backup", (req, res) => {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: "se requiere url" })
    if (!backups.includes(url)) {
        backups.push(url)
        console.log(`[BACKUP-3] Coordinador conocido registrado: ${url}`)
    }
    res.json({ message: "backup registrado", backups })
})

// Listar coordinadores conocidos
app.get("/backups", (req, res) => {
    res.json(backups)
})

// Sincronización: devuelve workers para que otro coordinador copie el estado
app.get("/sync-workers", (req, res) => {
    res.json(Object.values(servers))
})

// Recibir replicación del primario u otro coordinador
app.post("/replicate", (req, res) => {
    const { workers } = req.body
    if (!Array.isArray(workers)) {
        return res.status(400).json({ error: "se requiere array 'workers'" })
    }
    let merged = 0
    for (var i = 0; i < workers.length; i++) {
        var w = workers[i]
        if (w.id && w.url) {
            if (!servers[w.id] || w.lastPulse > servers[w.id].lastPulse) {
                servers[w.id] = w
                merged++
            }
        }
    }
    console.log(`[REPLICA] Recibida: ${workers.length} workers, ${merged} fusionados`)
    res.json({ message: "replicación recibida", received: workers.length, merged })
})

// Forzar sincronización manual hacia todos los coordinadores conocidos
app.post("/force-sync", (req, res) => {
    replicateToBackups()
    console.log(`[SYNC] Sincronización forzada hacia ${backups.length} coordinadores`)
    res.json({ message: "sincronización enviada", backups })
})


setInterval(() => {
    const now = Date.now()

    for (let id in servers) {
        if (now - servers[id].lastPulse > TIMEOUT) {
            delete servers[id]
            totalTimeouts++
            console.log(`[BACKUP-3] Worker ${id} eliminado por timeout`)
        }
    }
}, 5000)

app.listen(PORT, () => {
    console.log(`[BACKUP-3] Coordinator corriendo en http://localhost:${PORT}`)
})
