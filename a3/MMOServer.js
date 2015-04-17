/*
 * MMOServer.js
 * A skeleton server for massively multiplayer space battle.
 * Assignment 3 for CS4344, AY2013/14.
 *
 * Usage: 
 *   node MMOServer.js
 */

"use strict"; 

var LIB_PATH = "./";
require(LIB_PATH + "Config.js");
require(LIB_PATH + "Ship.js");
require(LIB_PATH + "Rocket.js");
require(LIB_PATH + "Player.js");

function MMOServer() {
    // private Variables
    var nextPID = 0;  // PID to assign to next connected player 
    var ships = {};   // Associative array for ships, indexed via player ID
    var rockets = {}; // Associative array for rockets, indexed via timestamp
    var sockets = {}; // Associative array for sockets, indexed via player ID
    var players = {}; // Associative array for players, indexed via socket ID

    /*
     * private method: broadcast(msg)
     *
     * broadcast takes in a JSON structure and send it to
     * all players.
     *
     * e.g., broadcast({type: "abc", x: 30});
     */
    var broadcast = function (msg) {
        var id;
        for (id in sockets) {
            sockets[id].write(JSON.stringify(msg));
        }
    }

    /*
     * private method: broadcastUnless(msg, id)
     *
     * broadcast takes in a JSON structure and send it to
     * all players, except player id
     *
     * e.g., broadcast({type: "abc", x: 30}, pid);
     */
    var broadcastUnless = function (msg, pid) {
        var id;
        for (id in sockets) {
            if (id != pid)
                sockets[id].write(JSON.stringify(msg));
        }
    }

    /*
     * private method: unicast(socket, msg)
     *
     * unicast takes in a socket and a JSON structure 
     * and send the message through the given socket.
     *
     * e.g., unicast(socket, {type: "abc", x: 30});
     */
    var unicast = function (socket, msg) {
        socket.write(JSON.stringify(msg));
    }

    /*
     * private method: newPlayer()
     *
     * Called when a new connection is detected.  
     * Create and init the new player.
     */
    var newPlayer = function (conn) {
        nextPID ++;
        // Create player object and insert into players with key = conn.id
        players[conn.id] = new Player();
        players[conn.id].pid = nextPID;
        sockets[nextPID] = conn;
    }

    
    //edited version of loop
      var gameLoop = function () {
        var i;
        var  j;
        for (i in ships) {
            ships[i].moveOneStep();
           // console.log("x and prevx is", ships[i].x , ships[i].previousx);
            //console.log("y and prevy is", ships[i].y , ships[i].previousy);
        }
          for(i in ships){
            for (j in ships){
                // This condition checks if a ship has entered another ship's vertical column of interest
                // The vertical area of interest has a width of 100 pixels
                if(i !== j && ((ships[i].x + 100 > ships[j].x && ships[j].x >= ships[i].x-100) && (ships[i].previousx + 100 < ships[j].previousx || ships[j].previousx < ships[i].previousx - 100)) 
                // This condition checks if a ship has entered another ship's horizontal row of interest
                // The horizontal area of interest has a height of 100 pixels
                ||   ((ships[i].y + 100 > ships[j].y && ships[j].y >= ships[i].y-100) && (ships[i].previousy + 100 < ships[j].previousy || ships[j].previousy < ships[i].previousy - 100))){
                    // if the previous conditions are true
                    // create the enemy ship in the client
                     unicast(sockets[i], {
                                            type:"new",
                                            id: j, 
                                            x: ships[j].x, 
                                            y: ships[j].y, 
                                            dir: ships[j].dir}); 
                                    }
        }
          }
        for (i in rockets) {
            rockets[i].moveOneStep();
            // remove out of bounds rocket
            if (rockets[i].x < 0 || rockets[i].x > Config.WIDTH ||
                rockets[i].y < 0 || rockets[i].y > Config.HEIGHT) {
                rockets[i] = null;
                delete rockets[i];
            } else {
                // For each ship, checks if the ship is within the rocket's area of interest
                // A rocket cannot hit its own ship
                for (j in ships) {            
                    //check for rocket direction
                    if (rockets[i] !== undefined && rockets[i].from != j && ((( rockets[i].dir == 'up' || rockets[i].dir == 'down')
                    //if rocket direction is up or down, consider a vertical column of interest 
                    // width of vertical column is 20 pixels with the rocket in the centre                                                      
                    && (rockets[i].x + 10 >= ships[j].x && rockets[i].x - 10 < ships[j].x))
                    // or, if the rocket direction is right or left, consider a horizontal row of
                    // interest                                                         
                    || (( rockets[i].dir == 'right' || rockets[i].dir == 'left')
                    // height of horizontal row is 20 pixels with the rocket in the centre                                                         
                    && (rockets[i].y + 10 >= ships[j].y && rockets[i].y - 10 < ships[j].y))))    
                        {
                        if (rockets[i].hasHit(ships[j])) {
                            // tell everyone there is a hit
                            broadcast({type:"hit", rocket:i, ship:j});
                            delete rockets[i];
                        }
                    } 
                }
            }
        }   
      }

    /*
     * priviledge method: start()
     *
     * Called when the server starts running.  Open the
     * socket and listen for connections.  Also initialize
     * callbacks for socket.
     */
    this.start = function () {
        try {
            var express = require('express');
            var http = require('http');
            var sockjs = require('sockjs');
            var sock = sockjs.createServer();

            // Upon connection established from a client socket
            sock.on('connection', function (conn) {
                newPlayer(conn);

                // When the client closes the connection to the 
                // server/closes the window
                conn.on('close', function () {
                    var pid = players[conn.id].pid;
                    delete ships[pid];
                    delete players[conn.id];
                    broadcastUnless({
                        type: "delete", 
                        id: pid}, pid)
                });

                // When the client send something to the server.
                conn.on('data', function (data) {
                    var message = JSON.parse(data)
                    var p = players[conn.id];
                    if (p === undefined) {
                        // we received data from a connection with
                        // no corresponding player.  don't do anything.
                        console.log("player at " + conn.id + " is invalid."); 
                        return;
                    } 
                    switch (message.type) {
                        case "join":
                            // A client has requested to join. 
                            // Initialize a ship at random position
                            // and tell everyone.
                            var pid = players[conn.id].pid;
                            var x = Math.floor(Math.random()*Config.WIDTH);
                            var y = Math.floor(Math.random()*Config.HEIGHT);
                            var dir;
                            var dice = Math.random();
                            // pick a dir with equal probability
                            if (dice < 0.25) {
                                dir = "right";
                            } else if (dice < 0.5) {
                                dir = "left";
                            } else if (dice < 0.75) {
                                dir = "up";
                            } else {
                                dir = "down";
                            }
                            ships[pid] = new Ship();
                            ships[pid].init(x, y, dir);
                            // When a new ship joins the game
                            // Render the new ship only if it falls within a client's ship Area of Interest
                            for ( var s in ships){
                             if (s !== pid && ships[s] !== undefined){
                                //Consider a vertical column of interest of width 100 pixels
                                if((ships[s].x + 100 > ships[pid].x && ships[pid].x > ships[s].x-100) 
                                //Or consider a horizontal row of interest of height 100 pixels
                                || (ships[s].y + 100 > ships[pid].y && ships[pid].y > ships[s].y-100)){        
                                 unicast(sockets[s],{
                                     type: "new",
                                     id: pid,
                                     x: x,
                                     y: y,
                                     dir: dir});
                                 }
                                 
                                }
                             }        
                            unicast(sockets[pid], {
                                type: "join",
                                id: pid,
                                x: x,
                                y: y,
                                dir: dir});   
                            
                            // Tell this new guy who else is in the game.
                            for (var i in ships) {
                            // Tell the new ship about the enemy ships that falls in his area of interest    
                                if (i != pid && ((ships[pid].x + 100 > ships[i].x && ships[i].x >= ships[pid].x-100)   
                ||   (ships[pid].y + 100 > ships[i].y && ships[i].y >= ships[pid].y-100))) {
                                    if (ships[i] !== undefined) {
                                        unicast(sockets[pid], {
                                            type:"new",
                                            id: i, 
                                            x: ships[i].x, 
                                            y: ships[i].y, 
                                            dir: ships[i].dir});   
                                    }
                                }
                            }
                            break;

                        case "turn":
                            var player_pid = players[conn.id].pid;
                            ships[player_pid].jumpTo(message.x, message.y);
                            ships[player_pid].turn(message.dir);
                            for (var i in ships) {
                                if (i != player_pid) {
                                    // Inform other ships about the turn only if the turning ship
                                    // turns in their area of interest
                                    if (ships[i] !== undefined){
                                        //Consider a vertical column of interest of width 100 pixels
                                        if((ships[i].x + 100 > ships[player_pid].x && ships[player_pid].x > ships[i].x-100) 
                                            //Or consider a horizontal row of interest of height 100 pixels
                                            || (ships[i].y + 100 > ships[player_pid].y && ships[player_pid].y > ships[i].y-100)){
                                        unicast(sockets[i], {
                                            type:"turn",
                                            id: player_pid, 
                                            x: message.x, 
                                            y: message.y, 
                                            dir: message.dir});   
                                    }
                                }
                            }
                        }

                            break;

                        case "fire":
                            // A player has asked to fire a rocket.  Create
                            // a rocket, and tell everyone (including the player, 
                            // so that it knows the rocket ID).
                            var pid = players[conn.id].pid;
                            var r = new Rocket();
                            r.init(message.x, message.y, message.dir, pid);
                            var rocketId = new Date().getTime();
                            rockets[rocketId] = r;
                            broadcast({
                                type:"fire",
                                ship: pid,
                                rocket: rocketId,
                                x: message.x,
                                y: message.y,
                                dir: message.dir
                            });
                            break;
                            
                        default:
                            console.log("Unhandled " + message.type);
                    }
                }); // conn.on("data"
            }); // socket.on("connection"

            // cal the game loop
            setInterval(function() {gameLoop();}, 1000/Config.FRAME_RATE); 

            // Standard code to start the server and listen
            // for connection
            var app = express();
            var httpServer = http.createServer(app);
            sock.installHandlers(httpServer, {prefix:'/space'});
            httpServer.listen(Config.PORT, Config.SERVER_NAME);
            app.use(express.static(__dirname));
            console.log("Server running on http://" + Config.SERVER_NAME + 
                    ":" + Config.PORT + "\n")
            console.log("Visit http://" + Config.SERVER_NAME + ":" + Config.PORT + "/index.html in your browser to start the game")
        } catch (e) {
            console.log("Cannot listen to " + Config.PORT);
            console.log("Error: " + e);
        }
    }
}

// This will auto run after this script is loaded
var server = new MMOServer();
server.start();

// vim:ts=4:sw=4:expandtab