/**
 * Sail the Wind interactive game board.
 * Copyright (c) 2017, Konstantin Tretyakov.
 * License: GPLv3
 */
 
// ----------- Utils ----------- //
function array2d(rows, cols, init) {
    return d3.range(rows).map(function(r) { return d3.range(cols).map(function(c) { return init(r,c); }); });
}

// ----------- Game-specific utils ----------- //
function randomPuff() {
    var v = Math.random();
    return (v < 0.1) ? -1 : (v > 0.9) ? 1 : 0;
}

function dir2vec(dir) {
    var dc = (dir == 7) || (dir <= 1) ? 1 
            :(dir >= 3) && (dir <= 5) ? -1 : 0;
    var dr = (dir >= 1) && (dir <= 3) ? 1
            :(dir >= 5) && (dir <= 7) ? -1 : 0;
    return {dc: dc, dr: dr};
}

// ----------- Game [Model/Controller] ------------ //
// ------------------ Player -------------------- //
function Player(r, c, dir) {
    this.r = r;
    this.c = c;
    this.dir = dir;
    this.starboardTack = true;
    this.blocked = false;
    this.spinnaker = false;
    this.windShadows = [];
}

Player.prototype.angleToWind = function(windDir) {
    var dwind = ((windDir - this.dir + 12) % 8);    
    if (dwind > 4) dwind = dwind - 8;
    else if (dwind == 4 && !this.starboardTack) dwind = -dwind;
    return dwind;
}

Player.prototype.updateTack = function(windDir) {
    var atw = this.angleToWind(windDir);
    if (atw != 0) this.starboardTack = (atw > 0);
}

Player.prototype.toggleSpinnaker = function(windDir) {
    if (this.blocked) return; // Do not do anything when blocked
    else if (Math.abs(this.angleToWind(windDir)) <= 2) return;
    if (this.spinnaker) this.spinnaker = false;
    else {
        // Throw a dice. If 1 comes, we fail.
        if (Math.random() < 1.0/6) this.blocked = true;
        else this.spinnaker = true;
    }
}

Player.prototype.turn = function(dir, windDir) {
    if (this.blocked) return; // Do not turn a blocked player
    
    var prevDir = this.dir;
    this.dir = (this.dir + dir + 8) % 8;
    if (this.spinnaker && Math.abs(this.angleToWind(windDir)) <= 2) {
        // Cannot turn to beam reach or higher with spinnaker
        this.dir = prevDir;
    }
    else {
        this.updateTack(windDir);
        // Manouvering removes all wind shadows
        this.windShadows = [];
    }
}


// ------------------ Game state -------------------- //
function GameState(nplayers, rows, cols) {
    this.rows = typeof rows !== 'undefined' ? rows : 14;
    this.cols = typeof cols !== 'undefined' ? cols : 15;
    this.nplayers = typeof nplayers !== 'undefined' ? nplayers : 4;
    this.init();
}

GameState.prototype.init = function() {
    var self = this;
    this.buoys = [{r: 10, c: 5}, {r: 10, c: 9}, {r: 3, c: 7}];
    this.puffs = array2d(this.rows, this.cols, function(r, c) { return randomPuff(); });
    this.wind = 2;
    this.players = [new Player(9, 2, 1), new Player(9, 12, 3), new Player(11, 14, 5), new Player(11, 0, 7)];
    this.players.splice(this.nplayers);
    this.currentPlayer = 0;
    this.currentTurn = 1;
    for (var i = 0; i < this.players.length; i++) this.players[i].updateTack(this.wind);
}

GameState.prototype.movePuffs = function() {
    var self = this;
    var d = dir2vec(this.wind);
    this.puffs = array2d(this.rows, this.cols, function(r, c) {
        if (r - d.dr < 0 || r - d.dr >= self.rows || c - d.dc < 0 || c - d.dc >= self.cols) return randomPuff();
        else return self.puffs[r-d.dr][c-d.dc];
    });
}

GameState.prototype.selectPlayer = function(i) {
    this.currentPlayer = i;
}

GameState.prototype.toggleSpinnaker = function() {    
    this.players[this.currentPlayer].toggleSpinnaker(this.wind);
}

GameState.prototype.checkPosition = function(r, c) {
    if (r >= this.rows || r < 0 || c >= this.cols || c < 0) return -1;
    for (var i = 0; i < this.buoys.length; i++) if (r == this.buoys[i].r && c == this.buoys[i].c) return -2;
    for (var i = 0; i < this.players.length; i++) if (r == this.players[i].r && c == this.players[i].c) return i+1;
    return 0;
}

GameState.prototype.move = function() {
    var p = this.players[this.currentPlayer];
    if (p.blocked) return; // Do not move a blocked player
    //if (p.angleToWind(this.wind) == 0) return; // Do not move against wind
    
    var d = dir2vec(p.dir);
    var newR = p.r + d.dr, newC = p.c + d.dc;
    if (this.checkPosition(newR, newC) != 0) return;
    p.r += d.dr; p.c += d.dc;
    
    // Compute wind shadow only for this and affected boat (do not consider all boats on the screen)
    var dWind = dir2vec(this.wind);
    var covR = p.r + dWind.dr; covC = p.c + dWind.dc;
    var other = this.checkPosition(covR, covC) - 1;
    if (other >= 0) this.addWindShadow(other);
    covR = p.r - dWind.dr; covC = p.c - dWind.dc;
    other = this.checkPosition(covR, covC) - 1;
    if (other >= 0) this.addWindShadow(this.currentPlayer);

    // See whether the player entered a lull, block it if so
    if (this.puffs[p.r][p.c] == -1) p.blocked = true;
    
    // See whether the player entered one of his own wind shadows, the block
    var wss = p.windShadows;
    for (var i = 0; i < wss.length; i++) 
        if (wss[i].r == p.r && wss[i].c == p.c) 
            p.blocked = true;
}


GameState.prototype.computeWindShadows = function(reset) {
    if (reset) for (var i = 0; i < this.players.length; i++) this.players[i].windShadows = [];
    
    var dWind = dir2vec(this.wind);
    for (var i = 0; i < this.players.length; i++) {
        var p = this.players[i];
        
        // See whom p covers
        var covR = p.r + dWind.dr; covC = p.c + dWind.dc;
        var other = this.checkPosition(covR, covC) - 1;
        if (other >= 0) this.addWindShadow(other);
    }
}

GameState.prototype.addWindShadow = function(playerId) {
    var p = this.players[playerId];
    var wss = p.windShadows;
    var d = dir2vec(p.dir);
    var wsR = p.r + 2*d.dr, wsC = p.c + 2*d.dc;
    if (this.checkPosition(wsR, wsC) >= 0) wss[wss.length] = {r: wsR, c:wsC};
}

GameState.prototype.turn = function(dir) {
    this.players[this.currentPlayer].turn(dir, this.wind);
}

GameState.prototype.nextPlayer = function() {
    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
}

GameState.prototype.newWind = function() {
    // 4/6 nothing happens
    // Otherwise it's 50% puff move and 50% wind rotation either side
    if (Math.random() < 1.0/3) {
        if (Math.random() < 0.5) {  // Move puffs
            this.movePuffs();
            // Recompute blocked state
            for (var i = 0; i < this.players.length; i++) {
                var p = this.players[i];
                p.blocked = (this.puffs[p.r][p.c] == -1);
            }
        }
        else {  // Rotate wind
            var dw = (Math.random() < 0.5) ? -1 : 1;
            this.wind = (this.wind + dw + 8) % 8;
            this.computeWindShadows(true);
            for (var i = 0; i < this.players.length; i++) {
                var p = this.players[i];
                p.updateTack(this.wind);
                if (p.spinnaker && Math.abs(p.angleToWind(this.wind)) <= 2) {
                    p.spinnaker = false;
                    p.blocked = true;
                }
            }
            
        }
    }
}

GameState.prototype.newTurn = function() {
    this.currentTurn += 1;
    this.currentPlayer = 0;
    this.newWind();
}

GameState.prototype.unblock = function() {
    var p = this.players[this.currentPlayer];    
    p.blocked = false;
}



// -------- Board [View] ----------- //
function GameBoard(svg) {
    // Container
    this.svg = typeof svg == 'string' ? d3.select(svg) : svg;
    this.state = new GameState();  // Create new state
    this.designMode = false;
    this.init();
}

GameBoard.prototype.init = function() {
    var self = this;
    var state = this.state;
    
    this.svg.select("#zoom").remove();   // Clear container
    
    // Zoomable group
    this.zoom = this.svg.append("g").attr("id", "zoom");    
    this.zoom.attr("transform", "translate(" + 3 + "," + 3 + ") scale(1.5)");    
    
    // Playing field
    var FIELD_SCALE = 1.4;
    this.field = this.zoom.append("g").attr("transform", "scale(" + FIELD_SCALE + ")");    
    this.field.selectAll("*").remove();
    
    // Add field squares
    var SQUARE_SIZE = 20;
    this.SQUARE_SIZE = SQUARE_SIZE;
    this.squares = this.field.selectAll(".square");
    this.squares
        .data(d3.range(state.rows * state.cols).map(function(i) { return {r: Math.floor(i/state.cols), c: i % state.cols}; }))
        .enter()
            .append("rect")
            .attr("x", function(d) { return d.c*SQUARE_SIZE; })
            .attr("y", function(d) { return d.r*SQUARE_SIZE; })
            .attr("class", function(d) { return "square" + 
                                                ((state.puffs[d.r][d.c] == -1) ? " lull"
                                                : (state.puffs[d.r][d.c] == 1) ? " puff" : ""); })
            .on("click", function(d) { return self.clickSquare(d); });

    // Add buoys
    this.field.selectAll(".buoy")
        .data(state.buoys)
        .enter()
            .append("image")
            .attr("href", "buoy.png")
            .attr("x", function(d) { return SQUARE_SIZE*d.c; })
            .attr("y", function(d) { return SQUARE_SIZE*d.r; })
            .attr("class", "buoy")
            .on("click", function(d,i,bs) { self.clickBuoy(d,i,bs); });
    
    // Players
    var playerTemplate = d3.select("#boat-template").node();
    var players = this.field.selectAll(".boat")
        .data(state.players)
        .enter().append(function() { return playerTemplate.cloneNode(true); })
        .attr("id", null)
        .attr("transform", function(d) { return "translate(" + (d.c + 0.5)*SQUARE_SIZE + "," + (d.r + 0.5)*SQUARE_SIZE + ") " + "rotate(" + 45*d.dir + ")"; })
        .attr("class", function(d, i) { return "boat player-" + (i+1); })
        .classed("selected", function(d, i) { return state.currentPlayer == i; })
        .classed("starboard", function(d, i) { return state.players[i].starboardTack; })
        .classed("port", function(d, i) { return !state.players[i].starboardTack; })
        .on("click", function(d, i) { 
            state.selectPlayer(i); 
            self.update();
        });
    
    // Player blocks
    var blockTemplate = d3.select("#boat-block-template").node();
    var blocks = this.field.selectAll(".boat-block")
        .data(state.players)
        .enter().append(function() { return blockTemplate.cloneNode(true); })
        .attr("id", null)
        .attr("transform", function(p) { return "translate(" + p.c*SQUARE_SIZE + "," + p.r*SQUARE_SIZE + ")"; })
        .classed("hidden", function(p) { return !p.blocked; })
    
    // Spinnakers
    this.field.selectAll(".boat .spinnaker")
        .data(state.players)
        .classed("hidden", function(p) { return !p.spinnaker; })

    // Wind shadows
    for (var i = 0; i < state.players.length; i++) {           
        this.field.selectAll(".windShadow.player-" + (i+1))
            .data(state.players[i].windShadows)
            .enter()
                .append("circle")
                .attr("class", "windShadow player-" + (i+1))
                .attr("r", 3)
                .attr("cx", function(ws) { return (ws.c+0.5)*SQUARE_SIZE; })
                .attr("cy", function(ws) { return (ws.r+0.5)*SQUARE_SIZE; });
    }
    
    // Controls
    var controls = this.zoom.append("g").attr("transform", "translate(" + (SQUARE_SIZE * state.cols * FIELD_SCALE + 10) + ",2) scale(1.1)");
    
    // Wind marker
    var windTemplate = d3.select("#wind-template").node();    
    controls.append(function() { return windTemplate.cloneNode(true); })
        .attr("id", null)
        .attr("transform", "translate(34,0) scale(0.65)");
    controls.select(".wind-image").attr("transform", "rotate(" + 45*state.wind + ")");

    // Turn counter
    var turnTemplate = d3.select("#turn-template").node();    
    controls.append(function() { return turnTemplate.cloneNode(true); })
        .attr("id", null)
        .attr("transform", "translate(34," + (SQUARE_SIZE*1.3*10+SQUARE_SIZE*2.5 + 5) + ") scale(0.65)");
    controls.select(".turn").text(state.currentTurn).classed("red", state.currentTurn == 6 || state.currentTurn == 7);
        
    // Buttons
    var buttonData = [
        {text: "Move", click: function() { state.move(); self.update(); }},
        {text: "Turn right", click: function() { state.turn(1); self.update(); }},        
        {text: "Turn left", click: function() { state.turn(-1); self.update(); }},
        {text: "Spinnaker", click: function() { state.toggleSpinnaker(); self.update(); }},        
        {text: "Unblock", click: function() { state.unblock(); self.update(); }},
        {text: "Next player", cls: "next-player", click: function() { state.nextPlayer(); self.update(); }},
        {text: "End turn", cls: "end-turn", click: function() { state.newTurn(); self.update(); }},
        {cls: "separator"},
        {text: "New game", cls: "new-game", click: function() { self.reset(); }},
        {text: "Setup buoys", cls: "setup-buoys", click: function() { self.toggleDesignMode(); }},
        ];
    
    
    var buttonRoot = controls.append("g").attr("transform", "translate(0," + SQUARE_SIZE*2.5 + ")");
    var buttons = buttonRoot.selectAll("g").data(buttonData).enter().append("g").attr("class", function(d) { return d.cls; });
    buttons.append("rect")
        .attr("rx", 5).attr("ry", 5).attr("class", "button")
        .attr("y", function(d, i) { return SQUARE_SIZE*1.3*i; })
        .on("click", function(d) { d.click(); });
    buttons.append("text").attr("class", "button")
        .attr("x", 3)
        .attr("y", function(d, i) { return SQUARE_SIZE*1.3*(i + 0.4); })
        .text(function(d) { return d.text; });
}

GameBoard.prototype.update = function() {
    var state = this.state;
    var SQUARE_SIZE = this.SQUARE_SIZE;
    
    // Rotate the wind marker
    this.zoom.select(".wind-image").transition().duration(1000).attr("transform", "rotate(" + 45*state.wind + ")");
    
    // Update current turn
    this.zoom.select(".turn").text(state.currentTurn).classed("red", state.currentTurn == 6 || state.currentTurn == 7);
    
    // Update puffs
    this.field.selectAll(".square")
        .attr("class", function(d) { return "square" + 
                                        ((state.puffs[d.r][d.c] == -1) ? " lull"
                                        : (state.puffs[d.r][d.c] == 1) ? " puff" : ""); });
                                        
    // Update wind shadows
    this.field.selectAll(".windShadow").remove();
    for (var i = 0; i < state.players.length; i++) {           
        this.field.selectAll(".windShadow.player-" + (i+1))
            .data(state.players[i].windShadows)
            .enter()
                .append("circle")
                .attr("class", "windShadow player-" + (i+1))
                .attr("r", 3)
                .attr("cx", function(ws) { return (ws.c+0.5)*SQUARE_SIZE; })
                .attr("cy", function(ws) { return (ws.r+0.5)*SQUARE_SIZE; });
    }    
                                        
    // Move players
    this.field.selectAll(".boat")
        .data(state.players)
        .attr("class", function(p, i) { return "boat player-" + (i+1); })
        .classed("selected", function(p, i) { return state.currentPlayer == i; })
        .classed("starboard", function(p) { return p.starboardTack; })
        .classed("port", function(p) { return !p.starboardTack; })
        .transition().duration(300)
        .attr("transform", function(p) { return "translate(" + (p.c + 0.5)*SQUARE_SIZE + "," + (p.r + 0.5)*SQUARE_SIZE + ") " + "rotate(" + 45*p.dir + ")"; });
        
    // Player blocks
    this.field.selectAll(".boat-block")
        .data(state.players)
        .attr("transform", function(p) { return "translate(" + p.c*SQUARE_SIZE + "," + p.r*SQUARE_SIZE + ")"; })
        .classed("hidden", function(p) { return !p.blocked; })
        
    // Spinnakers
    this.field.selectAll(".boat .spinnaker")
        .data(state.players)
        .classed("hidden", function(p) { return !p.spinnaker; })        
}

GameBoard.prototype.reset = function() {
    var nplayers = prompt("Enter number of boats (1-4)", "4");
    if (nplayers == null) return;
    nplayers = parseInt(nplayers);
    if (! (nplayers >= 1 && nplayers <= 4))
        alert("Please, enter a number between 1 and 4!");
    else {
        this.state = new GameState(nplayers);
        this.init();
    }
}

GameBoard.prototype.toggleDesignMode = function() {
    this.designMode = !this.designMode;
    d3.select("#field").classed("design-mode", this.designMode);
    d3.select(".setup-buoys").classed("active", this.designMode);
}

GameBoard.prototype.clickSquare = function(d) {
    var self = this;
    if (this.designMode) {
        // Add buoy at this point
        var b = this.state.buoys;
        b[b.length] = d;
        
        // Refresh field
        var SQUARE_SIZE = this.SQUARE_SIZE;
        this.field.selectAll(".buoy").remove();
        this.field.selectAll(".buoy")
            .data(b)
            .enter()
                .append("image")
                .attr("href", "buoy.png")
                .attr("x", function(d) { return SQUARE_SIZE*d.c; })
                .attr("y", function(d) { return SQUARE_SIZE*d.r; })
                .attr("class", "buoy")
                .on("click", function(d,i,bs) { self.clickBuoy(d,i,bs); });
    }
}

GameBoard.prototype.clickBuoy = function(d, i, bs) {
    var self = this;
    if (this.designMode) {
        // Remove buoy i
        this.state.buoys.splice(i, 1);
        bs[i].remove();
        // Refresh field
        this.field.selectAll(".buoy")
            .data(this.state.buoys)
            .on("click", function(d,i,bs) { self.clickBuoy(d,i,bs); });
    }
}
