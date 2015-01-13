var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 5000

app.use(express.static(__dirname + "/"))

var server = http.createServer(app)
server.listen(port)

console.log("http server listening on %d", port)

var wss = new WebSocketServer({server: server})
console.log("websocket server created")

// SETTINGS ENZO

// Onderstaande regel overgenomen uit voorbeeld, nog uit te zoeken waar het goed voor is. Zie http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/
"use strict";

// INITIALISATIE VAN GLOBALE VARIABELEN (kunnen worden opgevraagd en aangepast door alle functies die hieronder staan)

var rolNamen = ['Guard','Priest','Baron','Handmaid','Prince','King','Countess','Princess'];

// de variabele 'clients' is een lijst met daarin alle verbonden clients. Deze heb je nodig als je berichten wilt versturen.
var clients = [ ];
var connectedClientIDs = [ ];

// we hebben geen aparte playersIDlist nodig, want de player ID komt ALTIJD overeen met de positie in de players-list
var players = [ ];
var rollenInStapel = [ ];
var verwijderdeRolAanBegin = -1;
var gameIsOngoing = false;
var activePlayerID = -1;
var actieveRol = -1;
var wachtOpDoelwit = false;
var doelwitPlayerID = -1;
var wachtOpGuardKeuze = false;
var geradenRol = -1;

// 'CALLBACK'-FUNCTIE VOOR NIEUWE CONNECTIES

// Het gehele onderstaande stuk (tot de hulpfuncties) wordt parallel uitgevoerd voor elke verbonden client. 
wss.on('connection', function(connection) {
    
  // LOGS EN CHECKS BIJ NIEUWE CONNECTIE

    // accepteer de verbinding. Check wel de origin, da's blijkbaar belangrijk... (http://en.wikipedia.org/wiki/Same_origin_policy)
    //var connection = request.accept(null, request.origin);
    console.log((new Date()) + ' Connection accepted.');

  // SEMI-GLOBALE VARIABELEN (worden apart bijgehouden PER client)
    
    // Voeg de client toe aan het globale lijstje met clients. Onthoud de index als semi-globale variabele.
    var index = clients.push(connection) - 1;

    // De nieuwe user krijgt de eerste nog niet toegewezen user ID. 
    // Daarvoor gaan we een voor een de mogelijke user ids af, beginnend bij 1, en kijken of die al bestaat in het lijstje met actieve userIDs
    var clientIDisFree = false;
    var clientID = 1;
    while (! clientIDisFree) {
        if (connectedClientIDs.indexOf(clientID) == -1) {
            clientIDisFree = true;
        }
        else { 
            clientID++;
        }
    }

    connectedClientIDs.push(clientID);

    // STUUR ALLE RELEVANTE GEDEELDE INFORMATIE NAAR DE NIEUWE CLIENT

    // kijk eerst of er nog een speler is zonder connectie

    // zo ja, start dan het spel en stuur een voor een alle relevante stukjes info


    
    // FUNCTIE VOOR HET VERWERKEN VAN NIEUWE BERICHTEN VAN CLIENTS (wordt alleen uitgevoerd op het moment dat de client een bericht stuurt)

    connection.on('message', function message(message) {
        // parse het json-bericht
        try {
            var json = JSON.parse(message);
        }
        catch (e) {
            console.log('This doesn\'t look like a valid JSON: ', message);
            return;
        }

        // Achterhaal welke speler bij deze client hoort
        var playerID = -1;
        for (var i=0; i < players.length; i++) {
            var player = players[i];
            if (player.clientID == clientID) {
                playerID = player.playerID;
            }
        }

        switch(json.type) {
            case 'start':
                startGame();
                break;

            case 'kaartKlik':
                kaartKlik(playerID,json.data.rol);
                break;

            case 'doelwitKeuze':
                doelwitKeuze(playerID,json.data.gekozenDoelwitPlayerID);
                break;

            case 'userGuardKeuze':
                guardKeuzeOntvangen(playerID,json.data.geradenRol);
                break;

            default:
            console.log('Dit JSON-type is onbekend: ', json);
        }
    });

    // FUNCTIE ALS DEZE VERBINDING WORDT VERBROKEN
    connection.on('close', function() {
        // zoek de index van de userID in het lijstje userIDs
        var myCurrentIndex = connectedClientIDs.indexOf(clientID);

        // Haal de client uit het globale lijstje met clients, en ook de user ID uit het lijstje met actieve user IDs.
        clients.splice(myCurrentIndex, 1);
        connectedClientIDs.splice(myCurrentIndex, 1);

        // Zet een berichtje in de console
        console.log("User " + clientID + " is er vandoor");
    });
});

// FUNCTIES DIRECT GEKOPPELD AAN BINNENKOMENDE BERICHTEN (=GEBRUIKERSINPUT)

function startGame(){
    console.log("Het spel wordt gestart!");

    stuurJSONbericht('resetGame',players,{});

    players = [ ];
    gameIsOngoing = false;
    activePlayerID = -1;
    actieveRol = -1;
    wachtOpDoelwit = false;
    doelwitPlayerID = -1;
    wachtOpGuardKeuze = false;
    geradenRol = -1;

    // Schud de rollen
    rollenInStapel = [ 1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8 ];
    rollenInStapel.sort(function(a,b) { return Math.random() > 0.5; } );

    // Haal eerste rol uit de stapel
    verwijderdeRolAanBegin = haalRolVanStapel();
    console.log('Rol ' + verwijderdeRolAanBegin + ' is uit het spel verwijderd');

    // Ga de user IDs af, maak voor iedere user een player-object aan en geef de nieuwe speler een rol
    for (var i=0; i < connectedClientIDs.length; i++) {
        addPlayer(i);
    }

    // Verstuur spelerlijst naar alle spelers (eerst clearen)
    clearPlayerList();
    sendPlayerList();

    stuurJSONbericht('spelStart',players,{});

    // Geef iedereen een rol
    var nieuweRol = -1;
    for (var playerID=0; playerID < players.length; playerID++) {
        nieuweRol = haalRolVanStapel();
        geefRolAanSpeler(nieuweRol,playerID);
    }

    // Bepaal de startspeler
    var spelGaatVerder = true;
    switchActivePlayer(spelGaatVerder);

    // Start de eerste beurt
    startTurn();

    console.log("Het spel is gestart!");
    stuurJSONbericht('gameinfo', players ,{bericht: ''});
    stuurJSONbericht('gameinfo', players ,{bericht: 'Het spel is gestart!'});
}

function kaartKlik(playerID,rol) {
    var magRolSpelen = playerID == activePlayerID;
    var player = players[playerID];

    console.log('Speler ' + playerID + ' heeft geklikt op rol ' + rol);

    // als de speler de Countess heeft, mag de Prince of King niet gespeeld worden
    if (magRolSpelen && (rol == 5 || rol == 6)) {
        var ikHebCountess = (player.mijnRollen.indexOf(7) != -1)
        magRolSpelen = !ikHebCountess;
    }

    if (magRolSpelen) {
        actieveRol = rol;

        // Verwijder de gespeelde rol uit de hand en voeg hem toe aan de open rollen
        ontneemRolAanSpeler(actieveRol,activePlayerID);
        legRolOpen(activePlayerID,actieveRol);
    
        if ([1,2,3,5,6].indexOf(rol) != - 1) {
            wachtOpDoelwit = true;
            stuurJSONbericht('wachtOpDoelwit', player ,{rol:rol});
        }

        else {
            voerRolUit();
        }
    }
}

function doelwitKeuze(playerID,gekozenDoelwitPlayerID) {
    if (wachtOpDoelwit && activePlayerID == playerID) {
        var geldigeKeuze = valideerDoelwitKeuze(gekozenDoelwitPlayerID);
        
        if (geldigeKeuze) {
            wachtOpDoelwit = false;
        
            if (actieveRol == 1 && activePlayerID != doelwitPlayerID) {
                wachtOpGuardKeuze = true;
                stuurJSONbericht('wachtOpRolKeuzeVoorGuard', players[activePlayerID] ,{doelwitPlayerID:doelwitPlayerID});
            }
            else {
                voerRolUit();
            }
        }
    }
}

function valideerDoelwitKeuze(gekozenDoelwitPlayerID) {
    // Bepaal eerst hoeveel spelers er beschikbaar zijn om te targeten. Je kunt alleen iemand targeten die nog alive is en niet immune.
    var aantalOpties = 0;
    for (var i=0; i < players.length; i++) { 
        var player = players[i];
        if (player.alive && !player.immune) {
            aantalOpties++;
        }
    }

    var geldigeKeuze = false;

    // Je mag jezelf alleen kiezen als er maar 1 optie is om te kiezen (namelijk jezelf), of als je de prins speelt (die mag je namelijk op jezelf spelen)
    if (activePlayerID == gekozenDoelwitPlayerID) {
        geldigeKeuze = (aantalOpties == 1 || actieveRol == 5);
    }

    // Iemand anders dan jezelf mag je alleen kiezen als diegene dus alive is en niet immune
    else {
        var doelwitPlayer = players[gekozenDoelwitPlayerID];
        geldigeKeuze = (doelwitPlayer.alive && !doelwitPlayer.immune);
    }

    var activePlayer = players[activePlayerID];
    if (geldigeKeuze) {
        doelwitPlayerID = gekozenDoelwitPlayerID;
        stuurJSONbericht('doelwitKeuzeWasGeldig', activePlayer ,{});
    }

    return geldigeKeuze;
}

function guardKeuzeOntvangen(playerID,userGuardKeuze){
    if (wachtOpGuardKeuze && activePlayerID == playerID) {
        wachtOpGuardKeuze = false;
        geradenRol = userGuardKeuze;
        voerRolUit();
    }
}

function voerRolUit() {
    // Maak een berichtje voor in de server en voor de clients
    var consolebericht = 'Speler ' + activePlayerID + ' heeft de ' + rolNaam(actieveRol) + ' gespeeld';
    if(doelwitPlayerID != -1) {
        if(activePlayerID != doelwitPlayerID || actieveRol == 5) {
            consolebericht = consolebericht + ' op speler ' + doelwitPlayerID;
        }
        else {
            consolebericht = consolebericht + ' maar kan niemand targeten!';
        }
    }

    if(geradenRol != -1) {
        consolebericht = consolebericht + ' en raadt de ' + rolNaam(geradenRol);
    }

    // Stuur het berichtje naar de server-log en naar de clients
    consolebericht = consolebericht + '.';
    console.log(consolebericht);
    stuurJSONbericht('gameinfo', players, {bericht: consolebericht});

    // Roep de functie aan die hoort bij de gekozen rol
    var rolFuncties = [playGuard,playPriest,playBaron,playHandmaid,playPrince,playKing,playCountess,playPrincess];
    rolFuncties[actieveRol - 1]();

    // Beeindig de huidige beurt
    endTurn(activePlayerID);
}

// FUNCTIES DIE DIRECT GEKOPPELD ZIJN AAN ROLLEN

function playGuard() {
    // Het spelen van de guard is alleen relevant als er iemand anders kon worden getarget dan de actieve speler zelf
    var ontvangers = players;
    if (activePlayerID != doelwitPlayerID) {
        // Check of de geradenRol overeenkomt met de daadwerkelijke rol van de targetPlayerID
        if (huidigeSpelerRol(doelwitPlayerID) == geradenRol) {
            // Zo ja, verwijder dan de rol van die speler. Dat triggert (later) automatisch dat die speler doodgaat.
            ontneemRolAanSpeler(geradenRol,doelwitPlayerID);
            legRolOpen(doelwitPlayerID,geradenRol);
            stuurJSONbericht('gameinfo', ontvangers, {bericht: '>> De Guard had het goed in de smiezen! Speler ' + doelwitPlayerID + ' ligt uit het spel.'});
        }
        else {
            stuurJSONbericht('gameinfo', ontvangers, {bericht: '>> De Guard heeft verkeerd gegokt.'});
        }
    }
}

function playPriest() {    
    // Stuur een infoberichtje naar de speler met de rol van de getargete speler
    var doelwitRol = huidigeSpelerRol(doelwitPlayerID);
    
    var ontvanger = players[activePlayerID];
    stuurJSONbericht('gameinfo', ontvanger, {bericht: '>> Geheim bericht: speler ' + doelwitPlayerID + ' heeft een ' + rolNaam(doelwitRol) + '!'});
}

function playBaron() {
    // Bepaal de huidige rol van zowel de actieve als de getargete speler
    var activePlayerRol = huidigeSpelerRol(activePlayerID);
    var targetPlayerRol = huidigeSpelerRol(doelwitPlayerID);   
    
    // Als de getargete speler een lagere rol had, verwijder deze dan
    if (activePlayerRol > targetPlayerRol) {
        ontneemRolAanSpeler(targetPlayerRol,doelwitPlayerID);
        legRolOpen(doelwitPlayerID,targetPlayerRol);
    }

    // Als de actieve speler een lagere rol had, verwijder deze dan
    else if (activePlayerRol < targetPlayerRol) {
        ontneemRolAanSpeler(activePlayerRol,activePlayerID);
        legRolOpen(activePlayerID,activePlayerRol);
    }
}

function playHandmaid() {
    // Switch de immunity van de actieve speler naar 'true';
    var newImmunity = true;
    switchImmunity(activePlayerID,newImmunity);
}

function playPrince() {
    var targetPlayerRole = huidigeSpelerRol(doelwitPlayerID);
    stuurJSONbericht('gameinfo',players,{bericht: '>> Speler '+ doelwitPlayerID + ' had een ' + rolNaam(targetPlayerRole) +'.'});
    
    ontneemRolAanSpeler(targetPlayerRole,doelwitPlayerID);
    legRolOpen(activePlayerID,targetPlayerRole);
    
    // Het doelwit moet een nieuwe rol krijgen van de stapel
    var nieuweRol = haalRolVanStapel();
    geefRolAanSpeler(nieuweRol,doelwitPlayerID);
}

function playKing(){
    if (activePlayerID != doelwitPlayerID) {
        var targetPlayer = players[doelwitPlayerID];

        var activePlayerRole = huidigeSpelerRol(activePlayerID);
        var targetPlayerRole = huidigeSpelerRol(doelwitPlayerID);

        ontneemRolAanSpeler(activePlayerRole,activePlayerID);
        ontneemRolAanSpeler(targetPlayerRole,doelwitPlayerID);

        geefRolAanSpeler(targetPlayerRole,activePlayerID);
        geefRolAanSpeler(activePlayerRole,doelwitPlayerID);

        stuurJSONbericht('gameinfo',players,{bericht: '>> Speler ' + activePlayerID + ' en speler ' + doelwitPlayerID + ' hebben van rol gewisseld!'});
    }
}

function playCountess() {
    //de countess doet op zichzelf niets: de logica voor het verplicht spelen van de countess zit ergens anders!
}

function playPrincess() {
    //hier doet de prinses niets: de check voor het spelen van de prinses zit in een andere function!
}

// ALGEMENE FUNCTIES VOOR SPELACTIES DIE NIET DIRECT GEKOPPELD ZIJN AAN BINNENKOMENDE BERICHTEN
// Deze functies worden indirect aangeroepen door de server

function addPlayer(playerID){
    var playerobj = {
        playerID: playerID,
        clientID: connectedClientIDs[playerID],
        name: 'Player ' + playerID,
        alive: true,
        active: false,
        handmaid: false,
        mijnRollen: [],
        openRollen: []
    };
    players.push(playerobj);

    // Stuur de user ID in een berichtje naar de client (dit is nu overigens geen JSON-object, zou het misschien wel moeten zijn?!)
    stuurJSONbericht('receivePlayerID',playerobj,{nieuweID: playerID});
}

function sendPlayerList() {
    stuurJSONbericht( 'createPlayerList',players,{aantalSpelers: players.length});
    console.log('spelerlijst verzonden naar ' + connectedClientIDs.length + ' spelers');
}

function clearPlayerList() {
    stuurJSONbericht('clearPlayerList',players,{});
    console.log(connectedClientIDs.length + ' spelers gevraagd om de spelerlijst te clearen')
}

function startTurn(){
    var activePlayer = players[activePlayerID];

    if (activePlayer.immune) {
        var newImmunity = false;
        switchImmunity(activePlayerID,newImmunity);
    }

    var nieuweRol = haalRolVanStapel();
    geefRolAanSpeler(nieuweRol, activePlayerID);
}

function geefRolAanSpeler(rol,playerID) {
    // Als rol gelijk is aan -1, moet er een kaar van de stapel worden getrokken
    if(rol == -1) {
        rol = haalRolVanStapel();
    }
    
    var player = players[playerID];
    player.mijnRollen.push(rol);

    stuurJSONbericht( 'nieuweRol',player,{nieuweRol: rol});

    console.log('speler ' + playerID + ' heeft rol ' + rol + '  ontvangen');
}

function ontneemRolAanSpeler(rol,playerID){
    var player = players[playerID];

    var indexVanRol = player.mijnRollen.indexOf(rol);
    player.mijnRollen.splice(indexVanRol,1);

    stuurJSONbericht( 'leverRolIn',player,{rol:rol});

    console.log('speler '  + playerID + ' heeft rol ' + rol + '  verwijderd');
}

function legRolOpen(playerID,rol) {
    var player = players[playerID];
    player.openRollen.push(rol);

    if (rol == 8) {
        killPlayer(playerID);
    }
}

function endTurn(){
    players[activePlayerID].active = false;
    actieveRol = -1;
    doelwitPlayerID = -1;
    geradenRol = -1;

    // check of spelers zijn doodgegaan, en tel hoeveel spelers nog leven
    var alivePlayersLeft = 0;
    for (var i=0; i < players.length; i++) {
        var player = players[i];
        if (player.alive) {
            if (player.mijnRollen.length == 0) {
                killPlayer(i);
            }
            else {
                alivePlayersLeft++;
            }
        }
    }

    // check of er nog rollen op de stapel liggen
    if (rollenInStapel.length == 0 || alivePlayersLeft == 1) {
        var spelGaatVerder = false;
        switchActivePlayer(spelGaatVerder);
        endGame();
    }
    else {
        var spelGaatVerder = true;
        switchActivePlayer(spelGaatVerder);
        startTurn(activePlayerID);
    }
}

function killPlayer(playerID){
    players[playerID].alive = false;
    stuurJSONbericht( 'playerDied',players,{jsonPlayerID: playerID});
    console.log('speler ' + playerID + ' ligt eruit!');
    stuurJSONbericht('gameinfo', players, {bericht: '>> Speler ' + playerID + ' ligt eruit!'});
}

function endGame(){
    stuurJSONbericht('gameinfo', players, {bericht: 'Het spel is afgelopen!'});

    var highestRoleLeft = -1;
    var hoogsteOpenRolSom = -1;
    var winnerID = -1;
    var openRollenGevenDoorslag = false;

    for (var i=0; i < players.length; i++) {
        var player = players[i];
        if (player.alive) {
            // kijk welke rol deze speler over heeft
            var playerID = player.playerID;
            var myLastRole = huidigeSpelerRol(playerID);

            // sommeer de waarde van open rolllen
            var mijnOpenRolSom = player.openRollen.reduce(function(a,b){return a+b;});

            stuurJSONbericht('gameinfo', players, {bericht: '>> Speler ' + i + ' heeft nog een ' + rolNaam(myLastRole)});

            var ikStaVoor = false;

            if (myLastRole > highestRoleLeft) {
                openRollenGevenDoorslag = false;
                ikStaVoor = true;
                
            }
            else if (myLastRole == highestRoleLeft) {
                openRollenGevenDoorslag = true;

                if (mijnOpenRolSom > hoogsteOpenRolSom){
                    ikStaVoor = true;
                }
            }

            if (ikStaVoor) {
                highestRoleLeft = myLastRole;
                hoogsteOpenRolSom = mijnOpenRolSom;
                winnerID = player.playerID;
            }
        }
    }

    var consolebericht = 'Speler ' + winnerID + ' heeft gewonnen';
    if (openRollenGevenDoorslag) {
        consolebericht = consolebericht + ', maar de aflegstapel moest eraan te pas komen';
    }
    consolebericht = consolebericht + '!';

    console.log(consolebericht);

    stuurJSONbericht('gameinfo', players, {bericht: ''});
    stuurJSONbericht('gameinfo', players, {bericht: consolebericht});

    stuurJSONbericht('gameEnd',players,{winnaar: winnerID});
}

function switchActivePlayer(spelGaatVerder){
    if(spelGaatVerder) {
        // Als er nog geen startspeler was, wordt deze random bepaald
        if (activePlayerID == -1) {
            activePlayerID = Math.floor(Math.random() * players.length);
        }
        // Als er al wel een startspeler was, gaat de beurt door naar de volgende alive speler
        else {
            var currentActivePlayer = players[activePlayerID];
            currentActivePlayer.active = false;

            var aantalSpelers = players.length;
            activePlayerID = (activePlayerID + 1) % aantalSpelers;

            // bepaal de volgende speler (moet wel in-game zijn)
            while (!players[activePlayerID].alive) {
                activePlayerID = (activePlayerID + 1) % aantalSpelers;
            }
        }

        var newActivePlayer = players[activePlayerID];
        newActivePlayer.active = true;
    }
    else {
        activePlayerID = -1;
    }
    stuurJSONbericht('activePlayerChange',players,{newActivePlayerID:activePlayerID});
}

function switchImmunity(playerID,newImmunity){
    players[playerID].immune = newImmunity;
    stuurJSONbericht( 'immunityChange',players,{playerID:playerID, newImmunity: newImmunity});
}

function haalRolVanStapel() {
    var rol = -1;
    if (rollenInStapel.length > 0) {
        rol = rollenInStapel.pop();
        stuurJSONbericht('updateStapelVoorraad',players,{aantal: rollenInStapel.length});
    }
    else {
        rol = verwijderdeRolAanBegin;
    }

    return rol;
}

// HULPFUNCTIES

function huidigeSpelerRol(playerID) {
    return players[playerID].mijnRollen[0];
}

function rolNaam(rolID) {
    return rolNamen[rolID - 1];
}

function stuurJSONbericht(messageType,targetPlayerOrPlayers,messageObject) {
    var json = JSON.stringify({ type: messageType, data: messageObject})

    if (!(targetPlayerOrPlayers instanceof Array)) {
        targetPlayerOrPlayers = [targetPlayerOrPlayers];
    }

    for (var i=0; i < targetPlayerOrPlayers.length; i++) {
        var targetClientID = targetPlayerOrPlayers[i].clientID;

        if (targetClientID <= connectedClientIDs.length) {
            var clientIndex = connectedClientIDs.indexOf(targetClientID);
            clients[clientIndex].send(json);
        }        
    }
}
