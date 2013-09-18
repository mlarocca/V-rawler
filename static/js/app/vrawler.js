/** @module Vrawler
*/
var Vrawler = (function () {
            "use strict";
            
            var WIDTH, HEIGHT;
            var paper,
                ajaxCallsCounter = 0,
                gemTimeout,
                gemWorker,
                gemHistory = [],
                global_graph = [];
            var DESIRED_EDGE_LENGTH_SQUARED = {x: 16384, y: 16384},
                DISTURBANCE_RANGE = {x: 32, y: 32};
            var GRAPH_ANIMATION_DURATION = 1000,
                GRAPH_ANIMATION_DELAY_STEP = 750,
                GRAPH_ANIMATION_INITIAL_DELAY = 250,
                MESSAGE_DURATION = 5000,    //5 seconds
                LABEL_SIZE = 14;
            var MAX_ROUNDS_ON_VERTEX_MOVE = 5,
                MAX_ROUNDS = 20;
            var DEFAULT_OPACITY = 0.5,
                HIGHLIGHTED_OPACITY = 0.8,
                MIN_VERTEX_RADIUS = 35,
                MAX_VERTEX_RADIUS = 90,
                BACKGROUND_COLOR = '#111',
                LINE_COLOR = 'turquoise';                
            var URL_REGEX = /((http:[\/][\/])?(((www\.)?[a-z]|[A-Z]|[0-9]|[\/.]|[~])*)*)/i,
                //SCHEMA_REGEX = /(https?:[\/][\/])|(ftp:[\/][\/])/gi,
                HTTP_SCHEMA_REGEX = /(https?:[\/][\/])/gi;
                

            /** @class Vrawler
                Singleton object for Vrawler module
              */
            var module = Object.create({
                SERVER: "../", //"http://127.0.0.1:9083/";
                JSON_TAG: "json/",
                COLORS: ["green", "red", "orange", "orangered", "yellow", "blue", "magenta", "salmon", "black", "turquoise", "darkgreen", "pink", "brown"],
                TEXT_COLORS: ["yellow", "black", "indigo", "red", "black", "yellow", "red", "red", "white", "darkblue", "white", "red", "white"],
                /** PseudoConstructor method: init the object according to page size and properties.

                    @method init
                    @for Vrawler
                    
                    @return {Object} The original object.
                  */
                init: function () {
                    var w = $(window).innerWidth(),
                        h = $(window).innerHeight() - 50;

                    paper = new Raphael("vrawler", w, h);

                    this.setWidth(w);
                    this.setHeight(h);
                    //paper.canvas.style.backgroundColor = '#111';
                    paper.canvas.setAttribute("class", "svg-body");
                    paper.customAttributes.vertex_index = function(index) {
                        return {
                            vertex_index: index
                        };
                    }; 

                    return this;                   
                },
                /** Getter for width property.

                    @method getWidth
                    @for Vrawler
                    
                    @return {Number} The width of the Raphael paper.               

                  */
                getWidth: function () {
                    return WIDTH;
                },
                /** Setter for width property.

                    @method getWidth
                    @for Vrawler
                    @param {Number} w The desired width for the Raphael paper.
                    
                    @return {Object} The original object.              

                  */
                setWidth: function (w) {
                    WIDTH = w;
                    return this;
                },
                /** Getter for height property.

                    @method getàHeight
                    @for Vrawler
                    
                    @return {Number} The height of the Raphael paper.               

                  */                  
                getHeight: function () {
                    return HEIGHT;
                }, 
                /** Setter for width property.

                    @method getHeight
                    @for Vrawler
                    @param {Number} h The desired height for the Raphael paper.
                    
                    @return {Object} The original object.              

                  */                        
                setHeight: function (h) {
                    HEIGHT = h;
                    return this;
                },
                /** Getter for URL address of the server.

                    @method getServerUrl
                    @for Vrawler
                    
                    @return {String} A string representation of the URL of the server.

                  */                   
                getServerUrl: function () {
                    return this.SERVER + this.JSON_TAG;
                },
                /** Formats the path of a page so that it can be better displayed on the page's node.

                    @method formatPagePath
                    @for Vrawler

                    @param {String} path The original path.
                    @return {String} A string with a more suitable representation of the path.
                  */
                formatPagePath: function (path) {
                    if (path.length > 0 && path.charAt(0) === '/') {
                        return "/" + path.substr(1).replace(/\//g,"\n/");
                    } else {
                        return "/" + path.replace(/\//g,"\n/");
                    }
                },
                /** Clear the page by removing:
                    -   All event handlers from SVG's elements,   
                    -   Any SVG element from the paper,
                    -   All active timeouts.
                    It also stops the GEM algorithm, if it was running.

                    @method clearAll
                    @for Vrawler

                    @return {Object} The original object.
                  */
                clearAll: function () {
                    var i, j, v, adj, n, m;
                    
                    this.clearGEMTimeout();
                    
                    //Clear event handlers and timeouts

                    n = global_graph.length;
                    for (i = 0; i < n; i++) {
                        v = global_graph[i];

                        if (v.glowTimeout) {
                            clearTimeout(v.glowTimeout);
                        }
                        v.vertex.unbindAll();
                        v.label.unbindAll();
                        delete v.vertex;
                        delete v.label;
                        adj = v.edge_lines;
                        m = adj.length;
                        for (j = 0; j < m; j++) {
                            adj[j].unbindAll();
                            delete adj[j];
                        }
                        delete v.edges;
                        delete v.edge_lines;
                        delete global_graph[i];
                    }
                        
                    global_graph.length = 0;
                    
                    paper.clear();

                    return this;
                },
                /** 
                  */
                startGEM: function (graph, delay, rounds) {

                    gemWorker = new Worker('js/app/gem.min.js');

                    var self = this, n = graph.length, 
                        v, v_pos, vertices = [];

                    for (var i = 0; i < n; i++) {
                        v = graph[i];
                        v_pos = {
                            x: v.x,
                            y: v.y,
                            index: v.index,
                            size: v.size,
                            edges: v.edges
                        };
                        vertices[i] = v_pos;
                    }
                    gemWorker.postMessage({ 
                                            graph: vertices,
                                            max_rounds: rounds || MAX_ROUNDS,
                                            viewWidth: this.getWidth(),
                                            viewHeight: this.getHeight(),
                                            DISTURBANCE_RANGE: DISTURBANCE_RANGE,
                                            DESIRED_EDGE_LENGTH_SQUARED: DESIRED_EDGE_LENGTH_SQUARED
                                        });
                    gemWorker.onmessage = function (event) {

                        if (event.data.stop) {
                            gemWorker.terminate();
                            gemWorker = null;
                        } else {
                            gemHistory.push(event.data);
                        }
                    };
                    gemTimeout = setTimeout(function () {
                                                gemTimeout = setInterval(self.nextGEMUpdateFunction, GRAPH_ANIMATION_DURATION);
                                            },
                                            delay
                                );
                },
                
                /** If GEM algorithm is still running, cancels the active timeout associated with it.

                    @method clearGEMTimeout
                    @for Vrawler

                    @return {Object} The original object.
                  */
                clearGEMTimeout: function () {
                    if (gemTimeout) {
                        clearInterval(gemTimeout);
                        gemTimeout = null;
                    }

                    if (gemWorker) {
                        gemWorker.terminate();
                        gemWorker = null;
                    }

                    return this;
                },
                /** If GEM algorithm is running, pauses it by clearing the active timeout.
                    A reference to the function that will perform the next round of simulated annealing.

                    @method pauseGEM
                    @for Vrawler

                    @return {Object} The original object.
                  */                
                pauseGEM: function () {
                    if (gemTimeout) {
                        clearInterval(gemTimeout);
                    }

                    return this;
                },
                /** If GEM algorithm is running, stops it by canceling the active timeout associated with it and removing 
                    the reference to the function that would perform the next round of simylated annealing.

                    @method stopGEM
                    @for Vrawler

                    @return {Object} The original object.
                  */                   
                stopGEM: function () {
                    this.clearGEMTimeout();
                    if (gemHistory) {
                        gemHistory.length = 0;  //Erase History array avoiding loithering and leaks  
                    } 
                    return this;
                },
                /** If GEM algorithm is paused, resume it.

                    @method resumeGEM
                    @for Vrawler

                    @return {Object} The original object.
                  */                   
                resumeGEM: function () {
                    if (gemTimeout) {
                        gemTimeout = setInterval(this.nextGEMUpdateFunction, GRAPH_ANIMATION_DURATION);
                    } else {
                        module.showInfo("GEM isn't currently running or paused, can't be resumed");
                    }

                    return this;
                },
                nextGEMUpdateFunction: function() { 
                    var vertices, n;
                    if (gemHistory.length > 0) {                   
                        vertices = gemHistory[0];    //Update vertices coordinates
                        gemHistory.splice(0,1); //Removes first element from history array

                        n = vertices.length;
                        for (var i = 0; i < n; i++) {
                            //Updates coordinates on the graph object
                            global_graph[i].x = vertices[i].x;
                            global_graph[i].y = vertices[i].y;
                        }
                        module.updateGraph(global_graph);
                    } else if (gemWorker === null) {
                        module.stopGEM();
                    }
                },
                /** Set the values for the optimal edge length.
                    If the two coordinates are not evenly balanced, makes the bigger one equal to 1.418 times the smallest.

                    @method setDesiredEdgeLength
                    @for Vrawler

                    @param {Number} xlen The x-coordinate for the optimal length.
                    @param {Number} ylen The y-coordinate for the optimal length.

                    @return {Object} The original object.
                  */                                
                setDesiredEdgeLength: function (xlen, ylen) {
                    //Try to balance things
                    if (xlen > Math.sqrt(2) * ylen) {
                        xlen = Math.sqrt(2) * ylen;
                    } else if (ylen > Math.sqrt(2) * xlen) {
                        ylen = Math.sqrt(2) * xlen;
                    }

                    DESIRED_EDGE_LENGTH_SQUARED = {x: xlen * xlen, y: ylen * ylen};
                    this.setDisturbanceRange(xlen / 8, ylen / 8);

                    return this;
                },
                /** Set the values for the maximum random disturbance in GEM algorithm.

                    @method setDisturbanceRange
                    @for Vrawler

                    @param {Number} xrange The max disturbance on the x-axis.
                    @param {Number} yrange The max disturbance on the y-axis.

                    @return {Object} The original object.
                  */   
                setDisturbanceRange: function (xrange, yrange) {
                    DISTURBANCE_RANGE = {x: xrange, y: yrange};

                    return this;
                },
                /** Generate randomly a point on the Raphael paper.

                    @method randomCoordinates
                    @for Vrawler 
                    
                    @return {Array} An array with 2 elements, the x and y coordinates of the point.              
                  */
                randomCoordinates: function () {
                    return [Math.floor(Math.random() * WIDTH), Math.floor(Math.random() * HEIGHT)];
                },
                /** Creates a SVG "line" on page's main Raphael paper.

                    @method createLine
                    @for Vrawler 
                    
                    @param xs {Number} x coordinate of line's starting point.
                    @param ys {Number} y coordinate of line's starting point.
                    @param xe {Number} x coordinate of line's ending point.
                    @param ye {Number} y coordinate of line's ending point.

                    @return {Object} A reference to the SVG object created.
                  */                
                createLine: function(xs, ys, xe, ye) {
                    return paper.path(this.getLinePath(xs, ys, xe, ye));
                },
                /** Given a SVG "line" drawn on page's main Raphael paper, redraws it with new starting and ending points.

                    @method redrawLinePath
                    @for Vrawler 
                    
                    @param xs {Number} x coordinate of line's starting point.
                    @param ys {Number} y coordinate of line's starting point.
                    @param xe {Number} x coordinate of line's ending point.
                    @param ye {Number} y coordinate of line's ending point.

                    @return {Object} The original object.
                  */                  
                redrawLinePath: function(path, xs, ys, xe, ye) {
                    path.attr("path", this.getLinePath(xs, ys, xe, ye));

                    return this;
                },
                /** Given the four coordinates of the 2 endpoints of a line, return the string that
                    properly express the SVG path representing the line.

                    @method getLinePath
                    @for Vrawler 
                    
                    @return {String} The string representing the SVG path that draws the requested line.
                  */                 
                getLinePath: function(xs, ys, xe, ye) {
                    return ["M", xs, " ", ys, " L", xe, " ", ye].join("");
                },
                
                //Event Handlers

                /** Generate a mouseover handler for vertex objects.
                  * On mouseover if the the vertex has already been completely and correctly drawn (i.e. the glow animation has been completed,
                  * and hence the vertex opacity animation has longly been completed), then the opacity of the vertex if set to a brighter value to higlight it.
                  * The event handler should be attached on a set containing all vertices, to exploit event bubbling up.
                  *
                  * @param {Array} graph The list of vertices in the graph to be embedded: It will remain in the closure of the returned event handler.
                  *
                  * @return {Function} The event handler for mouseover events.
                  */ 
                generateMouseOverEventHandler: function (graph) {

                    return function (e) {
                        var vertex = graph[this.attr('vertex_index')];  //retrieves the vertex index from the target of the event (this reference)
                        if (!gemTimeout && !vertex.glowTimeout) {
                            vertex.vertex.attr({'fill-opacity': HIGHLIGHTED_OPACITY});
                        }
                    };
                },

                /** Generate a mouseout handler for vertex objects.
                  * On mouseout, if the the vertex has already been completely and correctly drawn (i.e. the glow animation has been completed,
                  * and hence the vertex opacity animation has longly been completed), then the opacity of the vertex if restored to default.
                  * The event handler should be attached on a set containing all vertices, to exploit event bubbling up.
                  *
                  * @param {Array} graph The list of vertices in the graph to be embedded: It will remain in the closure of the returned event handler.
                  *
                  * @return {Function} The event handler for mouseout events.
                  */                 
                generateMouseOutEventHandler: function (graph) {

                    return function (e) {
                        var vertex = graph[this.attr('vertex_index')];  //retrieves the vertex index from the target of the event (this reference)
                        if (!vertex.glowTimeout) {
                            vertex.vertex.attr({'fill-opacity': DEFAULT_OPACITY});
                        }
                    };
                }, 

                /** Generate a dragstart handler for vertex objects.
                  * When drag starts, initialize the "dragged" property to state that no actual drag has still taken place 
                  * and, only if GEM isn't running at the moment, init the parameters to be taken into account to correctly render the dragging.
                  * 
                  * The event handler should be attached on a set containing all vertices, to exploit event bubbling up.
                  *
                  * @param {Array} graph The list of vertices in the graph to be embedded: It will remain in the closure of the returned event handler.
                  *
                  * @return {Function} The event handler for dragstart events.
                  */                                      
                generateDragStartEventHandler: function (graph) {
                    var showInfo = this.showInfo;
                    return function () {
                        var vertex = graph[this.attr('vertex_index')];  //retrieves the vertex index from the target of the event (this reference)
                        vertex.dragged = false;    //True <=> actual dragging takes place                                                     
                        
                        if (!gemTimeout) {
                            this.ox = vertex.vertex.attr("cx"); //can't use "this" because function must work on both circle and text
                            this.oy = vertex.vertex.attr("cy"); 
                            this.glowx = this.ox;
                            this.glowy = this.oy;
                            vertex.dragging = true;                   
                        } else {
                            showInfo("When GEM algorithm is running or paused, vertex dragging is disabled. Click on STOP first.");
                        }
                    };

                },

                /** Generate a dragmove handler for vertex objects.
                  * The event handler should be attached on a set containing all vertices, to exploit event bubbling up.
                  *
                  * @param {Array} graph The list of vertices in the graph to be embedded: It will remain in the closure of the returned event handler.
                  *
                  * @return {Function} The event handler for dragmove events.
                  */                 
                generateDragMoveEventHandler: function (graph) {
                    var self = this;

                    return function (dx, dy) {
                                var vertex = graph[this.attr('vertex_index')];
                                var u, u_index, adj, e, j, m;
                                vertex.dragged = true;
                                if (vertex.dragging) {
                                    
                                    vertex.x = this.ox + dx;
                                    vertex.y = this.oy + dy;
                                    vertex.vertex.attr({cx: vertex.x, cy: vertex.y});   //can't use "this" because function must work on both circle and text
                                    vertex.label.attr({x: vertex.x, y: vertex.y});

                                    vertex.vertex_glow.translate(vertex.x - this.glowx, vertex.y - this.glowy);
                                    //Update gow position
                                    this.glowx = vertex.x;
                                    this.glowy = vertex.y;

                                    adj = vertex.edges;
                                    m = adj.length;
                                    for (j = 0; j < m; j++) {
                                        u_index = adj[j];
                                        u = graph[u_index];
                                        if (typeof vertex.edge_lines[u_index] !== "undefined") {
                                            e = vertex.edge_lines[u_index];
                                            e.attr({'path': self.getLinePath(vertex.x, vertex.y, u.x, u.y)});
                                        } else {
                                            e = u.edge_lines[vertex.index];
                                            e.attr({'path': self.getLinePath(u.x, u.y, vertex.x, vertex.y)});
                                        }
                                    }                                             
                                }
                            };

                },

                /** Generate a dragup handler for vertex objects.
                  * The event handler should be attached on a set containing all vertices, to exploit event bubbling up.
                  *
                  * @param {Array} graph The list of vertices in the graph to be embedded: It will remain in the closure of the returned event handler.
                  *
                  * @return {Function} The event handler for dragup events.
                  */                 
                generateDragUpEventHandler: function (graph) {                                
                    var self = this;

                    return function (e) {
                        //!IMPORTANT: Drag up event is fired before click event
                        
                        var vertex = graph[this.attr('vertex_index')];

                        if (vertex.dragging && vertex.dragged && e.button !== 2) { //Right click to drag without triggering GEM
                            self.startGEM(graph, GRAPH_ANIMATION_INITIAL_DELAY, MAX_ROUNDS_ON_VERTEX_MOVE);
                        }
                        vertex.dragging = false;
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    };    
                },

                /** Generate a click handler for vertex objects.
                  * The event handler should be attached on a set containing all vertices, to exploit event bubbling up.
                  *
                  * @param {Array} graph The list of vertices in the graph to be embedded: It will remain in the closure of the returned event handler.
                  * @param {Array} urls A list of objects representing the pages connected to corresponding vertices in graph.
                  *
                  * @return {Function} The event handler for click events.
                  */                 
                generateClickEventHandler: function (graph, urls) {
                    var self = this;

                    return function (e) {
                            var i = this.attr('vertex_index'),
                                vertex = graph[i],
                                page = urls[i];
                            
                            //!IMPORTANT: Drag up event is fired before click event
                            if (!vertex.dragged) {
                                self.showPageDetails(page.url, page.links, page.resources.images, page.resources.videos, page.resources.audios);
                            }
                            e.preventDefault();
                            e.stopPropagation();
                        };
                },

                /** Generate a callback function that performs glow animation on a vertex objects.
                  * The callback will be triggered by a timer started in drawGraph. 
                  *
                  * @param {Object} vertex The vertex on nwhich the glow must be applied.
                  *
                  * @return {Function} The event handler for mouseover events.
                  */                 
                generateGlowCallback: function(vertex) {
                     //closure on vertex and color
                    return function () {
                        vertex.vertex_glow = vertex.vertex.glow({width: 30, color: vertex.vertex_color, fill: true});
                        vertex.glowTimeout = null;
                        vertex = null;  //Break circular reference to avoid closure leaks
                    };
                },
                /** Utility function that simply return false.
                  *
                  */
                disableContentMenuFunction: function () {
                    return false; 
                },

                /** Draw a graph on the page's main Raphael paper.
                  *
                  */
                drawGraph: function (graph, urls) {
                    
                    var adj, page, color, text_color, line,
                        fillOpacityAnimation, lineAnimation, textAnimation, animationDelay,
                        max_size = 0,
                        vertices_set,
                        cs, v, u, i, j, m, n = graph.length,
                        maxAnimationDelay = 0;

                        
                    paper.clear();
                    vertices_set = paper.set();
                    

                    //set initial coordinates for each vertex
                    for (i = 0; i < n; i++) {
                        v = graph[i];
                        page = urls[i];
                        cs = this.randomCoordinates();
                        v.x = v.x0 = cs[0];
                        v.y = v.y0 = cs[1];
//global_graph[i] = $.extend(true, {}, v);   //Deep cloning of each vertex
                        if (page.page_size > max_size) {
                            max_size = page.page_size;
                        }
                    }

                    for (i = 0; i < n; i++) {
                        v = graph[i];
                        adj = v.edges;
                        m = adj.length;
                        page = urls[i];

                        //Create edges
                        v.edge_lines = {};
                        for (j = 0; j < m; j++) {
                            u = graph[adj[j]];
                            if (u.index > i) {  //[i === v.index]
                                //Process edges only once
                                animationDelay = GRAPH_ANIMATION_INITIAL_DELAY + Math.max(page.depth, urls[adj[j]].depth) * GRAPH_ANIMATION_DELAY_STEP;
                                if (maxAnimationDelay < animationDelay) {
                                    maxAnimationDelay = animationDelay;
                                }
                                lineAnimation = Raphael.animation({'stroke-opacity': DEFAULT_OPACITY},
                                                                  GRAPH_ANIMATION_DURATION, "easeIn");                                            
                                line = this.createLine(v.x, v.y, u.x, u.y)
                                                      .attr('stroke', LINE_COLOR)
                                                      .attr('stroke-opacity', 0)
                                                      .toBack()
                                                      .animate(lineAnimation.delay(animationDelay));

                                v.edge_lines[u.index] = line;
                            }
                        }

                        //Create vertices
                        color = v.vertex_color = this.COLORS[page.depth];
                        text_color = this.TEXT_COLORS[page.depth];
                        fillOpacityAnimation = Raphael.animation({'fill-opacity': DEFAULT_OPACITY,
                                                                  'stroke': color,
                                                                  'stroke-opacity': 1},
                                                                   GRAPH_ANIMATION_DURATION, "easeIn");
                        
                        textAnimation = Raphael.animation({'fill-opacity': 1},
                                                           GRAPH_ANIMATION_DURATION, "easeIn");

                        animationDelay = GRAPH_ANIMATION_INITIAL_DELAY + page.depth * GRAPH_ANIMATION_DELAY_STEP;
                        v.radius = MIN_VERTEX_RADIUS + (MAX_VERTEX_RADIUS - MIN_VERTEX_RADIUS) / (max_size || 1) * (page.page_size || 1);
                        v.size = v.radius / MAX_VERTEX_RADIUS;    //scale the size between 0 and 1
                        v.radius = Math.round(v.radius);

                        v.vertex =  paper.circle(v.x, v.y, v.radius)
                                        .attr({ 'fill': color,
                                                'fill-opacity': 0,
                                                'stroke-opacity': 0,
                                                'stroke': BACKGROUND_COLOR,
                                                'stroke-width': 3,
                                                'vertex_index': i})
                                        .animate(fillOpacityAnimation.delay(animationDelay));

                        vertices_set.push(v.vertex);
                        v.vertex.node.setAttribute("class","vertex");
                        


                        v.vertex.node.oncontextmenu = this.disableContentMenuFunction;  //Disable context menu

                        v.label = paper.text(v.x, v.y, this.formatPagePath(page.path))
                                       .attr({'fill': text_color, 
                                              'fill-opacity': 0,  
                                              'font-size': LABEL_SIZE,
                                              'vertex_index': i})
                                       .animateWith(v.vertex, fillOpacityAnimation, textAnimation.delay(animationDelay)); 
                        
                        vertices_set.push(v.label);
                        v.label.node.setAttribute("class", "vertex-text");
                      
                        v.label.node.oncontextmenu = this.disableContentMenuFunction;  //Disable context menu
                                     
                        v.glowTimeout = setTimeout(this.generateGlowCallback(v),
                                                    animationDelay + 500
                                                  ); 

                    }

                    //Add event handlers to the set
                    vertices_set.mouseover(this.generateMouseOverEventHandler(graph));
                    vertices_set.mouseout(this.generateMouseOutEventHandler(graph));
                    vertices_set.drag(this.generateDragMoveEventHandler(graph), this.generateDragStartEventHandler(graph), this.generateDragUpEventHandler(graph));                        
                    vertices_set.click(this.generateClickEventHandler(graph, urls));                    

                    return maxAnimationDelay + GRAPH_ANIMATION_DURATION;

                },
                updateGraph: function (graph) {
                    
                    var adj,
                        positionAnimation,
                        v, e, u, u_index, i, j, m, n = graph.length;

                    for (i = 0; i < n; i++) {
                        v = graph[i];
                        adj = v.edges;
                        m = v.edges.length;
                        positionAnimation = Raphael.animation({'x': v.x, 'y': v.y}, GRAPH_ANIMATION_DURATION, "easeIn");
                        //Animate vertices
                        v.label.animate(positionAnimation);
                        v.vertex.animateWith(v.label, positionAnimation, {'cx': v.x, 'cy': v.y}, GRAPH_ANIMATION_DURATION, "easeIn");
                        
                        v.vertex_glow && v.vertex_glow.animateWith(v.label, positionAnimation,
                                                  {'transform': "t" + (v.x - v.x0) + " " + (v.y - v.y0)}, 
                                                  GRAPH_ANIMATION_DURATION, 
                                                  "easeIn");
                        //Animate edges

                        for (j = 0; j < m; j++) {
                            u_index = adj[j];
                            if (typeof v.edge_lines[u_index] !== "undefined") {
                                u = graph[u_index];
                                e = v.edge_lines[u_index];
                                e.animate({'path': this.getLinePath(v.x, v.y, u.x, u.y)}, GRAPH_ANIMATION_DURATION, "easeIn");
                            }
                        }                                        

                    }

                }, 
                showPageDetails: function (url, links, images, videos, audios) {

                    var createBulletList = function (ul, list) {
                        var i, n, li, a;
                        ul.empty();  //Remove all children
                        n = list.length;
                        for (i = 0; i < n; i++) {
                            li = $("<li></li>");
                            a = $("<a href='" + list[i] + "' target='blank'>" + list[i] + "</a>");
                            li.append(a);
                            ul.append(li);
                        }
                    };

                    $("#detailsModalTitle").text(url);
                    $("#detailsModalTitle").attr('href', url);
                    createBulletList($("#linksUl"), links);
                    createBulletList($("#imagesUl"), images);
                    createBulletList($("#videosUl"), videos);
                    createBulletList($("#audiosUl"), audios);

                    $("#detailsModal").modal({
                                              show: true
                                            });
                },
                showLoading: function (show) {
                    if (show) {
                        var top =  module.getHeight() / 2 - parseInt( $(".loading-img").css("height"), 10) / 2,
                            left =  module.getWidth() / 2 - parseInt($(".loading-img").css("width"), 10) / 2;

                        $("#loading").css({visibility: "visible", 'z-index': 1, 'top': top, 'left': left});
                    } else {
                        $("#loading").css({visibility: "hidden", 'z-index': -1});
                    }
                },
                scheduleMessageRemoval: function(messageDOMElement) {
                    setTimeout( function () {
                                    messageDOMElement.remove(); 
                                },
                                MESSAGE_DURATION);
                },
                showError: function (message) {
                    var alert = $('<div class="alert alert-danger vrawler-alert">' +
                                    '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
                                    '<strong>Warning!</strong> <span id="dangerMessage">' + message + '</span>' + 
                                    '</div>');
                    $('body').append(alert);
                    module.scheduleMessageRemoval(alert);     

                },
                showWarning: function (message) {
                    var alert = $('<div class="alert alert-info vrawler-alert">' +
                                    '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
                                    '<strong>Warning!</strong> <span id="dangerMessage">' + message + '</span>' + 
                                    '</div>');
                    $('body').append(alert);
                    module.scheduleMessageRemoval(alert);
                },     
                showInfo: function (message) {
                    var alert = $('<div class="alert alert-success vrawler-alert">' +
                                    '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
                                    '<strong>Info:</strong> <span id="dangerMessage">' + message + '</span>' + 
                                    '</div>');
                    $('body').append(alert);
                    module.scheduleMessageRemoval(alert);             
                },
                showHelp: function (show) {
                    if (show) {
                        $("#help-frame-content").load("help/help-en.html",     //the selector prevent jQuery from running scripts before stripping them
                                                    function (response, status, xhr ) {
                                                        if ( status === "error" ) {
                                                            console.log(xhr.status, xhr.statusText);
                                                            module.showError("Sorry, we couldn't load the help file for your language.");
                                                        } else{
                                                            $("#help-frame").css({"visibility": "visible", "z-index": 1});
                                                        }                                                   
                                                    });
                    } else {
                        $("#help-frame").css({"visibility": "hidden", "z-index": -1});
                    }
                },
                validateURL: function (url) {
                    url = url.trim();
                    if (URL_REGEX.test(url) === false) {
                        return null;
                    }
                    url = url.replace(HTTP_SCHEMA_REGEX, "");
                    if (/:\/\/|(^mailto:$)/.test(url)) {
                        return null;
                    } else {
                        return url;
                    }
                },
                getSiteMap: function (url) {
                    $("#startModal").modal("hide");
                    this.stopGEM();
                    this.clearAll();
                    var self = this;
                    url = this.validateURL(url);
                    if (!url) {
                        this.showError("Error: the URL inserted isn't valid");
                        return;
                    }

                        
                    if (ajaxCallsCounter > 0) {
                        this.showWarning("An url is currently being parsed. Please wait until the request is completed");
                        return; //We are going to serve only just last call
                    }
                    this.showLoading(true);

                    ++ajaxCallsCounter; //One more call on the way

                    $.getJSON(url, {
                        format: "jsonp"
                    })
                    .done(function (data) {
                        var url_to_index = {},
                            urls = [],
                            v,
                            i, j, page, url,
                            index, n,
                            delay;


                        global_graph = [];
                        

                        for (url in data) {
                            
                            page = data[url];
                            page.url = url;
                            index = urls.length;   //next index will be the last in the array
                            url_to_index[url] = index;
                            
                            urls.push(page);

                            global_graph[index] = {'index': index, 'x': 0, 'y': 0, 'edges':[]};
                        }

                        n = global_graph.length;

                        if (n > 0) {

                            //Compute the desired edge length and the range of disturbance according to size of the window and number of vertices

                            self.setDesiredEdgeLength(self.getWidth() / Math.log(n + 1), self.getHeight() / Math.log(n + 1));

                            for (url in data) {
                                index = url_to_index[url];
                                v = global_graph[index];
                                page = data[url];
                                for (i = 0; i < page.links.length; i++) {
                                    j = url_to_index[page.links[i]];
                                    if (typeof j !== "undefined" && j !== index && $.inArray(j, v.edges) < 0) { //avoid duplicates
                                        v.edges.push(j);
                                        if ($.inArray(index, global_graph[j].edges) < 0) {
                                            global_graph[j].edges.push(index);
                                        }
                                    }
                                }
                            }

                            self.showLoading(false);

                            delay = self.drawGraph(global_graph, urls);
                            self.startGEM(global_graph, delay);
                        } else {
                            self.showLoading(false);
                            self.showError("Impossible to crawl the URL inserted");
                        }
                    }).always(function () {
                        //Always decrement jquery calls counter
                        --ajaxCallsCounter;
                    });
                    $( document ).ajaxError(function( event, jqxhr /*, settings, exception */) {
                        self.showLoading(false);
                        if (jqxhr.status === 400) {
                            self.showError("Website not found, please check the URL");
                        } else if (jqxhr.status === 408){
                            self.showWarning("Too many requests from this IP address: please wait at least 10 seconds");                        
                        } else {
                            self.showError("Impossible to crawl the URL inserted");
                        }
                    });
                }                
            });
            Object.freeze(module);
            return module;
        }());

$(function(){ 
    "use strict";
    //Add a new function to Raphael elements to unbind all event handlers
    Raphael.el.unbindAll = function () {
        
        while(this.events.length){          
            var e = this.events.pop();
            e.unbind();
        }
    };

    $('#detailsTab a').click(function (e) {

      e.preventDefault();
      $(this).tab('show');
    });

    $(window).load(function () {

        var url;
        Vrawler.init();

        $("#goSubmit").click(function (e) {
                        Vrawler.getSiteMap(Vrawler.getServerUrl() + $("#urlFieldNavBar").val());
                     });        
        $("#urlFieldNavBar").keypress(function (e) {
                                    if (e.which === 13) {
                                        e.preventDefault();
                                        Vrawler.getSiteMap(Vrawler.getServerUrl() + $("#urlFieldNavBar").val());
                                    }
                                });        
        $("#goButton").click(function (e) {
                        Vrawler.getSiteMap(Vrawler.getServerUrl() + $("#urlField").val());
                     });
        $("#urlField").keypress(function (e) {
                                    if (e.which === 13) {
                                        e.preventDefault();
                                        Vrawler.getSiteMap(Vrawler.getServerUrl() + $("#urlField").val());
                                    }
                                });
        $("#helpButton").click(function (e) {
                                    Vrawler.showHelp(true);
                                });
        $("#helpClose").click(function (e) {
                                    Vrawler.showHelp();
                                });

        $("#clearButton").click(function (e) {
                                    Vrawler.clearAll();
                                });
        $("#pauseButton").click(function (e) {
                                    Vrawler.pauseGEM();
                                });
        $("#stopButton").click(function (e) {
                                    Vrawler.stopGEM();
                                });
        $("#resumeButton").click(function (e) {
                                    Vrawler.resumeGEM();
                                });

        $(".page-title").click(function (e) {
                                $("#startModal").modal( {
                                      show: true
                                    }); 
                        });

        url = $.url().param('url');
        if (url) {
            Vrawler.getSiteMap(Vrawler.getServerUrl() + url);                                                                                                
        } else {
            $("#startModal").modal( {
                                      show: true
                                    });            
        }
    });
}());