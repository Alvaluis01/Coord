const socket = io();

const aliveDiv = document.getElementById("alive");
const deadDiv = document.getElementById("dead");

socket.on("connect", () => {
  console.log("Socket conectado");
});

socket.on("servers", servers => {

  console.log("Servers recibidos:", servers);

  aliveDiv.innerHTML="";
  deadDiv.innerHTML="";

  Object.entries(servers).forEach(([name,info])=>{

    const card=document.createElement("div");
    card.className="card "+info.status;

    card.innerHTML=`
      <strong>${name}</strong>
      <div style="font-size:12px">${info.url}</div>
    `;

    if(info.status==="alive") aliveDiv.appendChild(card);
    else deadDiv.appendChild(card);
  });

});