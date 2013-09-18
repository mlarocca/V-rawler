/** Web Worker module that implements the GEM algorithm
  * To start the algorithm, a PlainObject with fields x, y, index, size and edges must be sent by the caller with the postMessage method.
  * At every iteration, a message with the updated coordinates is sent to the caller, and on algorithm completion, a PlainObject with only
  * a single field, "stop", assigned the value "true" (or any truthy value), will be sent back to communicate GEM is finished.
  */

var ALPHA_R = Math.PI / 3,
    ALPHA_0 = Math.PI,
    SIGMA_R,
    SIGMA_0 = 1/3,
    INITIAL_T = 50,
    MIN_T = 0.001,
    MAX_T = 256,    
    GRAV_CONSTANT = 1/16;

var onmessage = startGEM;

function startGEM (event) {
    "use strict";
    var data = event.data;
    GEM(data.graph, data.max_rounds, data.viewWidth, data.viewHeight, data.DISTURBANCE_RANGE, data.DESIRED_EDGE_LENGTH_SQUARED);
}

/** GEM core method.
    Starts GEM algorithm, by initializing its internal properties and then starting its rounds.
    
    @method GEM
    @for Vrawler

    @param {Array} graph A list of the vertices in the graph to be embedded.
    @param {Number} max_rounds The maximum number of rounds to perform in the simulated annealing process, if the algorithm doesn't converge earlier.
*/
function GEM (graph, max_rounds, viewWidth, viewHeight, DISTURBANCE_RANGE, DESIRED_EDGE_LENGTH_SQUARED) {
    "use strict";
    var global_T,
        coordinates = [], 
        round,
        n = graph.length,
        baricenter,
        Ts = [],    //Temperature vector, for each vertex
        ds = [],    //Direction skew gauge vector, for each vertex
        ps = [],    //Impulse vector, for each vertex
        Phi = [],   //Function growing with vertex degree [1 + deg(v)/2]. Since degree is constant for each vertex, can be precomputes
        nextVertex = new Array(n);

    /** Return the angle between two vectors in the plane, expressed in radiants
      *
      * @method angleBetweenVectors
      * @private
      * @for Vrawler  
      * 
      * @param p {Object} The first vector, as an object with two fields: x and y.
      * @param q {Object} The second vector, as an object with two fields: x and y.
      * 
      * @return {Number} The angle between the two vectors, in radiants.
      */
    var angleBetweenVectors = function (p, q) {
        return Math.acos((p.x * q.x + p.y * q.y) / Math.sqrt(p.x * p.x + p.y * p.y) / Math.sqrt(q.x * q.x + q.y * q.y));
    };

    var initGEM = function () {
        var i, v;
        round = 0;
        global_T = INITIAL_T;

        SIGMA_R = 0.5 / n;  //Init sigma_r value

        baricenter = {x: 0, y:0};
        //vertices positions are already chosen randomly
        
        for (i = 0; i < n; i++) {
            v = graph[i];
            baricenter.x += v.x;
            baricenter.y += v.y;
            Ts[i] = INITIAL_T;
            ds[i] = 0;
            ps[i] = {x: 0, y: 0};
            Phi[i] = 1 + v.edges.length / 2;

            nextVertex[i] = i;
        }
        baricenter.x /= n;
        baricenter.y /= n;
    };

    /**
         @param {Array} vertexOrder A reference to the array specifing in which order the vertices should be processed.

         @return {Array} The same array, after shuffling.
      */
    var computeVertexOrder = function (vertexOrder) {
        var i, j, tmp;
        
        for (i = 1; i < n; i++) {
            j = Math.floor(Math.random() * i);
            tmp = vertexOrder[i];
            vertexOrder[i] = vertexOrder[j];
            vertexOrder[j] = tmp;
        } 

        return vertexOrder;
    };

    /**
        @param {Number} v_index The index of the vertex to process.
        @param {Object} c The baricenter of the graph embedding (as a simple object with x and y coordinates).

        @return {Object} The impulse just computed for the vertex (as a simple object with x and y coordinates).
      */ 
    var computeVertexImpulse = function (v_index, c) {

        var v = graph[v_index],
            delta = {x: (Math.random() - 0.5) * DISTURBANCE_RANGE.x, y: (Math.random() - 0.5) * DISTURBANCE_RANGE.y},
            i, u, m = v.edges.length,
            p = {x:0, y:0},
            tmp,
            delta_module_squared;

        //Attraction to the center of gravity
        //console.log("--A:", c.x, v.x , GRAV_CONSTANT, v.size, Phi[v_index] , delta.x, DISTURBANCE_RANGE)
        tmp = GRAV_CONSTANT * Phi[v_index] * v.size;   //optimization: compute this product once

        p.x = (c.x - v.x) * tmp;
        p.y = (c.y - v.y) * tmp;

        //Gravitational boost if the vertex is out of the screen
        if (v.x <= v.radius || v.x + v.radius >= viewWidth) {
            p.x *= 4;
        }
        if (v.y <= v.radius || v.y + v.radius >= viewHeight) {
            p.y *= 4;
        }                                    

        //Add random noise
        p.x +=  delta.x;
        p.y +=  delta.y;

        for (i = 0; i < n; i++) {
            //Repulsive forces between vertices
            if (i !== v_index) {
                u = graph[i];
                delta.x = v.x - u.x;
                delta.y = v.y - u.y;
                if (delta.x !== 0 || delta.y !== 0) {
                    delta_module_squared = (delta.x * delta.x) + (delta.y * delta.y);

                    tmp =  v.size * u.size / delta_module_squared;  //optimization: compute this product once

                    p.x += delta.x * DESIRED_EDGE_LENGTH_SQUARED.x * tmp;
                    p.y += delta.y * DESIRED_EDGE_LENGTH_SQUARED.y * tmp;
                }
            }
        }

        for (i = 0; i < m; i++) {
            //Attractive forces between pair of adjacent vertices
            u = graph[v.edges[i]];

            delta.x = v.x - u.x;
            delta.y = v.y - u.y;
            delta_module_squared = (delta.x * delta.x) + (delta.y * delta.y);
            tmp = delta_module_squared / Phi[v_index];    //optimization: compute this product once
            p.x -= delta.x / DESIRED_EDGE_LENGTH_SQUARED.x * tmp;
            p.y -= delta.y / DESIRED_EDGE_LENGTH_SQUARED.y * tmp;
        }

        return p;
    };

    /**
      * @param v The vertex to update.
      * @param p The impulse vector.
      * @return {null}
      */
    var updateVertex = function(v, p) {
        var p_module,
            v_index = v.index,
            v_p = ps[v_index],
            beta;

        if (p.x !== 0 || p.y !== 0) {
            p_module = Math.sqrt(p.x * p.x + p.y * p.y);
            p.x *= Ts[v_index] / p_module;
            p.y *= Ts[v_index] / p_module;
            v.x += p.x;
            v.y += p.y;
            //Quickly update the baricenter
            baricenter.x += p.x / n;
            baricenter.y += p.y / n;
        }

        if (v_p.x !== 0 || v_p.y !== 0) {
            beta = angleBetweenVectors(p, v_p);
            var sin_beta = Math.sin(beta),
                cos_beta  = Math.cos(beta);
            if (sin_beta > Math.sin(Math.PI + ALPHA_R / 2)) {
                //Rotation detected
                ds[v_index] += SIGMA_R * sin_beta ? (sin_beta < 0 ? -1 : 1) : 0;
            }
            if (Math.abs(cos_beta) > Math.cos(ALPHA_0 / 2)) {
                //Oscillation detected => lower temperatur
                Ts[v_index] *= SIGMA_0 * cos_beta;
            }

            Ts[v_index] *= (1 - ds[v_index]);
            Ts[v_index] = Math.min(Ts[v_index], MAX_T);
            ps[v_index] = p;
        }
    };

    /**
      *
      */
    var nextRound = function () {
        var i, v_index;

        if (global_T <= MIN_T || round >= max_rounds) {
            postMessage({ stop: true });
            return;
        }
        //else
        round += 1;
        nextVertex = computeVertexOrder(nextVertex);

        for (i = 0; i < n; i++) {
            //N iterations

            v_index = nextVertex[i];

            updateVertex(graph[v_index], computeVertexImpulse(v_index, baricenter));
                
        }

        //Send back only the data strictly necessary
        for (i = 0; i < n; i++) {
            coordinates[i] = {x: graph[i].x, y: graph[i].y};
        }
        postMessage(coordinates);
        nextRound();
    };

    initGEM();

    nextRound();
}