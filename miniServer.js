const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json()); 

const port = process.argv[2];
const NAME = process.argv[3];

const MIDDLEWARE_URL = "https://unrippled-jeanett-impedingly.ngrok-free.dev";

let pulseInterval;

function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}


/*if (!port || !NAME) {
    console.error("Debe proporcionar puerto y nombre");
    process.exit(1);
}*/


// Ruta base de prueba
app.get("/", (req, res) => {
    res.send(`miniServer '${NAME}' activo en puerto ${port}`);
});


// Inicio del servidor
app.listen(port, async () => {
    log("INFO", `Server '${NAME}' is running on http://localhost:${port}`);

    try {
        await axios.post(`${MIDDLEWARE_URL}/register`, {
            name: NAME,
            url: `http://localhost:${port}`
        }, {
            timeout: 3000
        });

        log("INFO", "Server registrado correctamente");

        pulseInterval = setInterval(async () => {
            try {
                await axios.post(`${MIDDLEWARE_URL}/pulse/${NAME}`, {}, {
                    timeout: 3000
                });
                log("INFO", "Pulso enviado");
            } catch (error) {
                log("ERROR", `Error enviando pulso: ${error.message}`);
            }
        }, 5000);

    } catch (error) {
        log("ERROR", `Error registrando server: ${error.message}`);
    }
});

// Apagar servidor
app.post("/shutdown", (req, res) => {
    if (pulseInterval) {
        clearInterval(pulseInterval);
        pulseInterval = null;
    }

    log("INFO", `Servidor ${NAME} detenido`);

    res.json({ message: `${NAME} dejó de enviar pulso` });
});