import { build_objs, windowToTimelineMonths, load_pattern_data } from "./patterns.js";
import { TOT_SLE, TOT_CONTROLS } from "./metrics.js";
const revealedNodes = new Set(); // Nodes set to visible / clicked on
var clickedInsideNetwork = false;

// Constants for access in node_objs map
const PLUS_NAME = "plus-sym";
const RAW_NODE = "node-obj";
const NODE_MARGINS = 3;
const BORDER_WIDTH = 1;
const NETWORK_Y_POS = 65;
const NODE_DEF_SIZE = 40;
const NODE_HEIGHT_MAX = 65;
const NODE_WIDTH_MAX = 70;
const PLUS_M_BASE_SIZE = 22;
const PLUS_M_DEPTH = 4;

var networks = [];
var network_containers = [];
var node_to_seq = new Map();
var node_objs = new Map();        // Plus symbol and other elements associated with nodes
                                  // In the form node -> map -> dom element ID
                                  // Currently Node -> { "plus-sym" : div }
var plus_m_symb = new Map();
var clust_divs = []; // Divs for clusters

// Creating insert
Array.prototype.insert = function ( index, ...items ) {
    this.splice( index, 0, ...items );
};

export const SORT_TYPE = {
    LENGTH: 0,
    FREQ: 1,
    ODDS: 2,
    GROWTH: 3
};

function getFontSize(label) {
    // Get font size relative to a labels text length

    const len = label.length;
    const NUM_WORDS_FACTOR = Math.max(6 - (label.split("\n").length * 2), 0)
    
    if (len < 5) return 23 - NUM_WORDS_FACTOR;
    if (len < 10) return 21 - NUM_WORDS_FACTOR;
    if (len < 15) return 17 - NUM_WORDS_FACTOR;
    if (len < 20) return 16 - NUM_WORDS_FACTOR;
    if (len < 25) return 15 - NUM_WORDS_FACTOR;
    if (len < 40) return 14 - NUM_WORDS_FACTOR;

    return 12;
}

function sort_method_comp(seqA, seqB, sort_method) {
    /* 
        Compare seqA and seqB by the given sort method

        If seqA > seqB, return true
            Else, return false

        ">" of what is compared is determined by the sort_method
    */

    switch(sort_method) {
        case SORT_TYPE.LENGTH:
            return seqA.length > seqB.length;
        case SORT_TYPE.FREQ:
            return seqA.num_patients[0] > seqB.num_patients[0];
        case SORT_TYPE.ODDS:
            return seqA.odds_ratio[1] > seqB.odds_ratio[1];
        case SORT_TYPE.GROWTH:
            return seqA.growth_rate > seqB.growth_rate;

        default:
            return false;
    }

    return false // ERR
}

function sort_sequences(sequences, sort_method) {
    /*
        Insertion sort
        Sort each sequences into a new list by the chosen sort method
    */
    
    var n_sequences = []
    for (var i = 0; i < sequences.length; i++) {
        var cur_seq = sequences[i].central_seq;

        // Go through n_sequences
        var inserted = false;
        for (var k = 0; k < n_sequences.length; k++)
        {
            var comp_seq = n_sequences[k].central_seq;

            if (sort_method_comp(cur_seq, comp_seq, sort_method)) {
                inserted = true;
                n_sequences.insert(k, sequences[i]);
                break;
            }
        }

        if (!inserted)
            n_sequences.push(sequences[i])
    }

    return n_sequences
}

function sort_by_cluster(sequences, override_clusts = false){
    /* 
        Returns clusters in the form [ [clust 1 -> seq1, seq2, seq2], [Clust 2, ...]]

        sequences: The sequences to group
        override_clusts: Assign everything in the same cluster if true
    */

    var clusters = new Map();
    for (var seq_network of sequences) {
        var seq = seq_network.central_seq;

        if (override_clusts) {
            if (!clusters.has(1))
                clusters.set(1, []);

            clusters.get(1).push(seq_network);
        }
        else {
            if (!clusters.has(seq.cluster))
                clusters.set(seq.cluster, [])

            clusters.get(seq.cluster).push(seq_network)
        }
    }

    // Return a list of the clusters sorted by key in the map
    return [...clusters]
            .sort((a, b) => a[0] - b[0])
            .map(([key, value]) => value);
}

function clear_net(){

    document.querySelectorAll("div.net").forEach(div => {
        div.remove();
    });

    document.querySelectorAll("div.patInfo").forEach(div => {
        div.remove();
    });

    document.querySelectorAll("div.cluster").forEach(div => {
        div.remove();
    });

    revealedNodes.clear();
    networks.length = 0
    network_containers.length = 0;
    clust_divs.length = 0;
    node_to_seq = new Map();

    // Remove the divs associated with nodes
    for (var [_, p_div] of plus_m_symb)
    {
        p_div.remove();
    }

    plus_m_symb = new Map();
    node_objs = new Map();
}

const COLORS = {
    low:  [173, 216, 230], // 1 = light blue
    mid:  [0, 102, 114],   // 2 = blue
    good: [0, 180, 75],    // 3 = green
    high: [220, 50, 50]    // >3 = red
};

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
    return `rgb(${
        Math.round(lerp(c1[0], c2[0], t))
    }, ${
        Math.round(lerp(c1[1], c2[1], t))
    }, ${
        Math.round(lerp(c1[2], c2[2], t))
    })`;
}

function valueToColor(value) {
    if (value <= 2) {
        return lerpColor(COLORS.low, COLORS.mid, value - 1);
    }

    if (value <= 3) {
        return lerpColor(COLORS.mid, COLORS.good, value - 2);
    }

    // Saturates at 6
    const t = Math.min(1, (value - 3) / 3);
    return lerpColor(COLORS.good, COLORS.high, t);
}

function getFutureNodes(startNode, network) {
    const visited = new Set();

    function traverse(nodeId) {
        const connectedEdges = network.getConnectedEdges(nodeId);

        for (const edgeId of connectedEdges) {
            const edge = network.body.data.edges.get(edgeId);

            // only follow outgoing edges
            if (edge.from === nodeId) {
                if (!visited.has(edge.to)) {
                    
                    // Only consider the node as visited if it is not on the main path
                    if (!node_objs.get(edge.to).on_path) {
                        visited.add(edge.to);
                        traverse(edge.to);
                    } else {
                        // Do not traverse main path
                    }
                }
            }
        }
    }

    traverse(startNode);
    return Array.from(visited);
}

function collapseNode(nodeId, network) {
    const nodesToCollapse = getFutureNodes(nodeId, network);

    if (nodesToCollapse.length === 0) {
        return;
    }

    network.cluster({
        joinCondition: function(nodeOptions) {
            return nodesToCollapse.includes(nodeOptions.id);
        },
        clusterNodeProperties: {
            id: "cluster_" + nodeId,
            label: "Collapsed (" + nodesToCollapse.length + ")",
            shape: "box",
            hidden: true,
            selectable: false,
            chosen: false
        }
    });
}

function expandNode(nodeId, network) {
    const clusterId = "cluster_" + nodeId;

    if (network.isCluster(clusterId)) {
        network.openCluster(clusterId);
    }
}

function darkenRGB(rgb, amount = 0.2) {
    // Given an rgb value (as string), return the darkened color by a fixed amount

    const factor = 1 - amount;

    const values = rgb.match(/\d+/g).map(Number);

    const darker = values.map(c => Math.round(c * factor));

    return `rgb(${darker.join(", ")})`;
}

function get_y_shift(network_level) {
    /* Get the shift in Y pos for a node */
    
    const YPOS_BASE_SHIFT = 65; // Default / base shift
    const YPOS_SHIFT_PIX = YPOS_BASE_SHIFT + 10; // Shift amount per level
    const YPOS_SHIFT_AMT = (network_level - 1) * YPOS_SHIFT_PIX; // Final shift from level

    const YPOS = YPOS_BASE_SHIFT + YPOS_SHIFT_AMT;
    return YPOS;
}

function get_network_properties() {
    return {
        layout: {
            improvedLayout: false,
            
            hierarchical: {
                enabled: false
            },
        },
        physics: {
            enabled: false
        },
        interaction: { dragNodes: false, dragView: false, zoomView: false },
        nodes: {
            shape: 'box',
            margin: NODE_MARGINS,
            size: NODE_DEF_SIZE,
            widthConstraint: NODE_WIDTH_MAX,
            heightConstraint: NODE_HEIGHT_MAX,
            font: {
                size: 18,
                multi: true
            }
        }
    };
}

function get_node_properties(node_id, label_text, itemset_window, sequence_length, 
    starting_node, subset_seq, prev_x, network_node) {
    // Return the properties of the node
    // Returns a list [node properties, xpos, ypos]

    const RESCALE_AT_LEN = 6 // TODO: Rescale doesnt work with smaller sequences
    const width80 = window.innerWidth * 0.8;
    const EDGE_XFACTOR = 5;
    const NO_WIND_RED = 60;
    const DEF_NEXT_ITEMSET_DIST = 170;
    const INIT_POS = (-window.innerWidth / 2) + (window.innerWidth / 7.5);

    const YPOS = get_y_shift(network_node.value.network_level);

    // Amount to shift a node by to make the edge longer
    // Scale the smaller sequences by a larger amount (as we have more room)
    var edge_shift = (EDGE_XFACTOR * itemset_window) - NO_WIND_RED;

    if (starting_node)
        var n_xpos = INIT_POS;
    else
        var n_xpos = prev_x + edge_shift + DEF_NEXT_ITEMSET_DIST;
    
    const gr_color = valueToColor(subset_seq.growth_rate);
    
    return  [{   // Properties of a node 
        id: node_id, label: label_text,
        font: {
            size: getFontSize(label_text)
        },
        x: n_xpos,
        y: YPOS,

        fixed: {
            x: true,
            y: true
        },

        color: {
            background: gr_color,
            border: darkenRGB(gr_color, 0.5)
        },
        borderWidth: BORDER_WIDTH
    }, n_xpos, YPOS];
}

function get_edge_properties(edge_id, prev_id, node_id, window, multi_level) {
    return {  // Properties of an edge
        id: edge_id, from: prev_id, to: node_id, 
        arrows: { to: { enabled: true, type: 'arrow', scaleFactor: 0.5 } },
        label: windowToTimelineMonths(window), // edge label text
        font: { align: 'center', size: 15, color: '#000', vadjust: -15 }, // label style
        scaling: { label: true },
        width:1,
        smooth: {
            enabled: multi_level,
            type: "curvedCCW",
            roundness: 0.4
        }
    }
}

function draw_single_path(network, node_names, edges, cur_node_id, cur_edge_id) {
    let seq = network.central_seq; // Assign the sequence itself instead of the network used

    // Creates nodes and edges 
    // Edge: 1st itemset -> next -> until end of sequence
    // Node: Itemset
    var first_n = true;
    var prev_id = -1;
    var cur_itemset_pos = 0;
    var prev_xpos = 0;

    // Manage the sequence
    for (var i = 0; i < seq.length; i++) {
        var itemset = seq.get_item(i);

        // The subset that this position in the sequence refers to (if available)
        var subset_seq = seq.get_subset_by_seq_indx(cur_itemset_pos);
        node_to_seq.set(cur_node_id[0], subset_seq); // Track node -> seq

        var label_text = itemset.name_str();
        
        // Get node information
        var node_prop = get_node_properties(cur_node_id[0], label_text, itemset.window, seq.length, 
            cur_itemset_pos == 0, subset_seq, prev_xpos, network.head);
        node_names.push(node_prop[0]);

        // Set edge
        if (!first_n){
            prev_id = cur_node_id[0] - 1;
            edges.push(get_edge_properties(cur_edge_id[0], prev_id, cur_node_id[0], itemset.window, false));   
            ++cur_edge_id[0];
        }
        
        first_n = false;
        ++cur_node_id[0];
        ++cur_itemset_pos;
        prev_xpos = node_prop[1];
    }
}

function draw_single_seq(seq, node_names, edges, label_text, itemset_window, 
    cur_node, first_n=true, prev_xpos=0, cur_itemset_pos = 0) {
    /*
        Draw out a single sequence

        Returns the xposition used for the sequence
    */

    // The subset that this position in the sequence refers to (if available)
    var subset_seq = seq.get_subset_by_seq_indx(cur_itemset_pos);
    node_to_seq.set(cur_node.node_id, subset_seq); // Track node -> seq
    
    // Get node information
    var node_prop = get_node_properties(cur_node.node_id, label_text, itemset_window, seq.length, 
        cur_itemset_pos == 0, subset_seq, prev_xpos, cur_node);
    node_names.push(node_prop[0]);

    // Set edge
    if (!first_n){
        var prev_id = cur_node.prev.node_id;
        edges.push(get_edge_properties(cur_node.node_id, prev_id, cur_node.node_id, itemset_window, seq.network_level != 1));
    }

    // Tracking the node
    node_objs.set(cur_node.node_id, cur_node);

    return node_prop[1]
}

function get_path_pos(node, original_path) {
    /* 
        Get the position that a node is in on the original path 
        For example, given the path: A -> B -> C

        With the node that represents A -> B -> D. We get a position of 1 (B) as the latest point

        Assumption: node starts at C.
    */

    var cur_node = node;
    var offset_pos = 0;
    while (cur_node !== null)
    {
        if (cur_node.value.get_item(itemset_pos).Equals(original_path.get_item(itemset_pos)))
        {
            offset_pos += 1;
            cur_node = cur_node.prev;
        }
    }
}

function find_earlier_paths(nodeIDA, nodeIDB, original_path) {
    /*
        Given two network nodes (Vis network nodes)

        Return the node that is not on the original path (else, the smallest value, else nodeA)
    */

        // TODO: In progress ? Can improve this

    // The nodes in the network
    // These nodes are the point of overlap
    var nodeA = node_objs.get(nodeIDA);
    var nodeB = node_objs.get(nodeIDB);

    var res_node = nodeA;
    var res_id = nodeIDA;

    if (nodeA.on_path && !nodeB.on_path)
    {
        // B wins
        res_node = nodeB;
        res_id = nodeIDB;
    }
    else if (!nodeA.on_path && !nodeB.on_path)
    {
        // Neither on path
        var b_smaller = (nodeB.value.length < nodeA.value.length) ? true : false

        if (b_smaller)
        {
            res_node = nodeB;
            res_id = nodeIDB;
        }
    }

    return [res_node, res_id];
}

function node_shift(visNetwork, node_point, yShift, checked_nodes) {
    /* 
        Shift the y values of the given node and all of its future connections 
        Track what nodes were checked.
    */

    var nodeId = node_point.node_id;
    checked_nodes.add(nodeId);

    // Shift the node and all its future nodes by the given y value
    const pos = visNetwork.getPositions([nodeId])[nodeId];
    visNetwork.moveNode(nodeId, pos.x, yShift);

    for (var n_node of node_point.next_nodes)
    {
        node_shift(visNetwork, n_node, yShift, checked_nodes);
    }
}

function network_bounding_box(nodeId, network) {
    /*
        Get the bounding box of a node (coordinates)
    */

    const FUZZY_OFFSET = 2; // Encase of additional information extending from a node
    const TOT_OFFSET = NODE_MARGINS + FUZZY_OFFSET + BORDER_WIDTH;
    const BOX = network.getBoundingBox(nodeId);

    return {
        left: BOX.left + TOT_OFFSET,
        top: BOX.top + TOT_OFFSET,
        right: BOX.right - TOT_OFFSET,
        bottom: BOX.bottom - TOT_OFFSET
    };
}

function adjust_levels(visNetwork, network) {
    /* 
        Does this network have any nodes that overlap?
            Given A -> B -> C
                A -> B -> D
                A -> D

            The two paths A -> B -> D and A -> D will have the 2nd node too close to one another
                As they are in the same level (level 2) of the graph.

        Therefore, we check if the next node has this special case. If so, shift the level up to the maximum of the next nodes.

        returns the new highest network_level.
    */

    const nodeIds = visNetwork.body.data.nodes.getIds();
    const tracked_nodes = new Set();
    var highest_level = network.max_level;

    // Search through the networks nodes
    for (let i = 0; i < nodeIds.length; i++) {
        const id1 = nodeIds[i];

        if (! tracked_nodes.has(id1)) {
            for (let j = i + 1; j < nodeIds.length; j++) {
                
                const id2 = nodeIds[j];

                // Box positions of each node
                const box1 = network_bounding_box(id1, visNetwork);
                const box2 = network_bounding_box(id2, visNetwork);

                // Check for overlap of the bounds
                const overlapping =
                            box1.left < box2.right &&
                            box1.right > box2.left &&
                            box1.top < box2.bottom &&
                            box1.bottom > box2.top;

                if (overlapping) {
                    // Determine which node to shift (The one that diverged earlier in the original path)
                    var [earlier_node, nodeId] = find_earlier_paths(id1, id2, network.central_seq);
                    [id1, id2].forEach(item => tracked_nodes.add(tracked_nodes)) // Don't shift either of them

                    var n_y = get_y_shift(earlier_node.value.network_level + 1);
                    highest_level = Math.max(highest_level, earlier_node.value.network_level + 1);
                    
                    // Shift the previous node to the next level
                    node_shift(visNetwork, earlier_node, n_y, tracked_nodes);
                    break; // One shift per node at most
                }
            }
        }
    }

    network.max_level = highest_level;
}

function draw_multi_level_path(cur_node, node_names, edges, first_n=true, prev_xpos=0, cur_itemset_pos = 0)
{
    /*
        Draw a multi-path network

        Returns the final edge ID
    */

    // Get relevant node info to draw it
    var seq = cur_node.value;
    var itemset_to_draw = seq.get_item(cur_itemset_pos);

    prev_xpos = draw_single_seq(seq, node_names, edges, itemset_to_draw.name_str(), 
        itemset_to_draw.window, cur_node, first_n, prev_xpos, cur_itemset_pos);

    if (cur_node.next_nodes.length > 0) {
        for (let oth_path of cur_node.next_nodes) {
            // Draw each next path
            draw_multi_level_path(oth_path, node_names, edges, false, prev_xpos, cur_itemset_pos + 1)
        }
    }
}

function updateAttachedInfoPos(nodeId, plus_symb, visNetwork, network_offset) {
    /*
        Update the position and sizes of the info attached to a node
    */
    var node_test_obj = node_objs.get(nodeId);
    console.log(node_test_obj.primary_seq);

    // Node info
    var node = visNetwork.body.nodes[nodeId];
    var node_box = visNetwork.getBoundingBox(nodeId);
    var node_width = node.shape.width;
    var node_height = node.shape.height;

    var scale = visNetwork.getScale();
    var screenWidth = node_width * scale;
    var screenHeight = node_height * scale;

    // Get edges of the node for proper positioning
    var bottomRight = visNetwork.canvasToDOM({
        x: node_box.right,
        y: node_box.bottom
    });

    var new_size = PLUS_M_BASE_SIZE / ((NODE_WIDTH_MAX / screenWidth));
    var new_depth = PLUS_M_DEPTH / ((NODE_WIDTH_MAX / screenWidth));
    
    // Adjust position and sizes
    plus_symb.style.left = `${bottomRight.x - (node_width * 0.3 - NODE_MARGINS)}px`;
    plus_symb.style.top = `${bottomRight.y - (node_height * 0.3 - NODE_MARGINS)}px`;

    plus_symb.style.setProperty("--horizontal-width", `${new_size}px`);
    plus_symb.style.setProperty("--horizontal-height", `${new_depth}px`);

    plus_symb.style.setProperty("--vertical-width", `${new_depth}px`);
    plus_symb.style.setProperty("--vertical-height", `${new_size}px`);
}

function draw_network(network, network_options, network_id, cur_node_id, cur_edge_id, 
    is_first_network, cluster_div, compressed=true) {

    /*  Draw a given network
        Returns the node and edge ids after drawing
    */

    const graph_layer = document.getElementById("graph");
    const container = document.getElementById("network_body");
    container.appendChild(cluster_div);

    var node_names = [];
    var edges = [];

    if (!compressed) {
        draw_single_path(network, node_names, edges, cur_node_id, cur_edge_id);
    }
    else {
        draw_multi_level_path(network.head, node_names, edges);
    }

    // Done -- Setup the network

    var nodes = new vis.DataSet(node_names);
    var edges = new vis.DataSet(edges);
    var data = {
        nodes:nodes,
        edges:edges
    };

    const containing_element = document.createElement('div');

    // Styling and setting up element attributes
    containing_element.className = 'net';
    containing_element.setAttribute('id', 'Network #' + network_id);
    const NETWORK_BASE_HEIGHT = 85;

    containing_element.style.height = (NETWORK_BASE_HEIGHT * (network.max_level)) + "px";
    
    const FIRST_MARGIN = 70;
    if (compressed && is_first_network)
    {
        containing_element.style.marginTop = (FIRST_MARGIN + 7 * network.max_level) + 'px';
    }
    else 
    {
        containing_element.style.marginTop = '70px';
    }

    cluster_div.appendChild(containing_element);

    // On-click info-element
    const info_element = document.createElement('div');
    info_element.className = 'patInfo';
    info_element.style.position = container.style.position;

    graph_layer.appendChild(info_element);

    const n_network = new vis.Network(containing_element, data, network_options);

    // Adjust the networks conflicting nodes (if applicable, not possible with max_level = 1)
    if (network.max_level > 1)
    {   
        var prev_highest = network.max_level;
        adjust_levels(n_network, network);
        
        // resize if necessary
        if (network.max_level > prev_highest)
        {
            containing_element.style.height = (NETWORK_BASE_HEIGHT * (network.max_level)) + "px";

            n_network.redraw();
        }
    }

    // Calculate network y position
    if (compressed) {
        const head_id = network.head.node_id;
        const rootPos = n_network.getPositions([head_id])[head_id];
        var compressed_offset = 0.5 - ((network.max_level - 1) * 0.5);

        const targetScreenY = NETWORK_BASE_HEIGHT * compressed_offset;
        
        const targetCanvasY = n_network.DOMtoCanvas({
            x: 0,
            y: targetScreenY
        }).y;

        var y_offset = 2 * rootPos.y - targetCanvasY
    }
    else {
        var y_offset = 65;
        var compressed_offset = 0;
    }

    // Set initial network pos (same pos for all)
    n_network.moveTo({
        position: {
            x: 0,
            y: y_offset
        },
        scale: 1,
        animation: false
    });
    n_network.redraw();

    // Setup everything for each node
    const net_nodes = n_network.body.data.nodes.getIds();
    for (let nodeId of net_nodes) {

        // Compressed? Add plus/minus options to the node
        if (compressed) {

            let node = node_objs.get(nodeId);

            if (node.on_path && node.next_nodes.length > 1) {
                let plus_symb = document.createElement('div');
                
                plus_symb.className = "plus-icon";
                plus_symb.setAttribute("id", nodeId); // Ensuring each plus_m is assigned different id
                plus_m_symb.set(nodeId, plus_symb);
                plus_symb.classList.toggle("minus"); // Initially off
                plus_symb.style.position = 'absolute';
                containing_element.appendChild(plus_symb);

                // Button click on plus/minus symbol
                plus_symb.addEventListener("mousedown", (event) => {
                    event.stopPropagation(); // Prevent node click (below this element)

                    // Do we hide or show nodes?
                    const hide_elems = plus_symb.classList.contains("minus");

                    if (hide_elems)
                    {
                        collapseNode(nodeId, n_network);
                    }
                    else
                    {
                        expandNode(nodeId, n_network);
                    } 

                    plus_symb.classList.toggle("minus"); // Apply next toggle
                });
            }
        }
    }

    // Setup re-draw of plus_minus symbols if the network itself has to redraw
    n_network.on("afterDrawing", function () {
        let net_node_ids = n_network.body.data.nodes.getIds();

        // For each node, re-size its plus symb
        for (const node_id of net_node_ids)
        {
            if (plus_m_symb.has(node_id))
            {
                updateAttachedInfoPos(node_id, plus_m_symb.get(node_id), this, compressed_offset);
            }
        }
    });

    // Sequence on-click info
    n_network.on("click", function (params) {
        clickedInsideNetwork = true;

        // Re-hide hidden info elements
        for (var info of revealedNodes) {
            info.style.display = "none";
        }

        revealedNodes.clear();

        if (params.nodes.length === 0) return

        const nodeId = params.nodes[0]; 

        // Setting the position of the on-click event
        const pos = n_network.getPositions([nodeId])[nodeId];
        const canvasPos = n_network.canvasToDOM(pos);
        const rect = n_network.body.container.getBoundingClientRect();
        const Y_OFFSET = (y_offset / 2) + (5 - (5 * network.max_level)); // Network pos + small shift

        info_element.style.top = rect.top + window.scrollY - Y_OFFSET + "px";
        info_element.style.display = "block";
        
        var ref_seq = node_to_seq.get(nodeId);
        
        // Show pattern info
        const slePct = (ref_seq.num_patients[0] / TOT_SLE * 100).toFixed(1);
        const controlPct = (ref_seq.num_patients[1] / TOT_CONTROLS * 100).toFixed(1);
        const odds_to_str = ref_seq.odds_ratio[1] + ' (' + ref_seq.odds_ratio[0] + ' - ' + ref_seq.odds_ratio[2] + ')';
        info_element.innerHTML = `
            <div class="network-stats">
               <div class="selected seq">
                    <strong>${ref_seq.shortened_str()}</strong>
                </div>

                <div class="group odds">
                    <strong>${"OR: " + odds_to_str}</strong>
                </div>

                <div class="group left sup">
                    <strong>${ref_seq.num_patients[0]}</strong>
                    <span>(${slePct}%)</span>
                    <label>SLE</label>
                </div>

                <div class="group right sup">
                    <strong>${ref_seq.num_patients[1]}</strong>
                    <span>(${controlPct}%)</span>
                    <label>CONTROLS</label>
                </div>
            </div>
        `;

        revealedNodes.add(info_element)
    });
    
    networks.push(n_network);
    network_containers.push(containing_element)
}

export function build_network(sort_method, desc=true, compressed=false, contrasted_only=true, clustered=false) 
{
    /*
        Core function.  Build the entire network. For each independant sequence create a canvas,
            drawing each node on the canvas to represent the visualization of sequences.

        sort_method: Order in which networks are shown
        desc: Is this descending order of the sort method?
        compressed: Are branches separate sequences or occurring on the same path?
        conrasted_only: Using only contrastive sequences or all statistically significant sequences
    */

    // Clear previous network (if any)
    clear_net();

    // settings for the network
    var network_options = get_network_properties();

    // Pyscript: Build the sequences
    var file_data = (contrasted_only) ? patterns_contrasted : patterns_all;

    var sequence_networks = build_objs(file_data, compressed);
    console.log("Total networks: ", sequence_networks.length);

    var network_id = 0;
    var edge_id = [0];
    var node_id = [0];
    var num_clusts = 1;

    // Assume everything is one cluster
    var clusters = [sequence_networks]

    if (clustered){
        clusters = sort_by_cluster(sequence_networks);
    }

    var first_n = true;
    for (var cluster of clusters) {
        let cluster_div = document.createElement('div');
        cluster_div.className = "cluster";
        cluster_div.setAttribute("id", "cluster#: " + num_clusts);

        if (!clustered)
        {
            // Make the clusters border invisible
            cluster_div.style.border = "none";
        }
        else {
            // Multiple potential "real" clusters.
            // Title for the cluster to show the user which one is which.
            let title = document.createElement("div");
            title.textContent = "Cluster = " + num_clusts;
            title.className = "cluster-title";
            cluster_div.appendChild(title);
        }

        clust_divs.push(cluster_div);
        sequence_networks = sort_sequences(cluster, sort_method);

        if (!desc) sequence_networks.reverse();

        for(var seq_n of sequence_networks){
            draw_network(seq_n, network_options, network_id, node_id, edge_id, first_n, cluster_div, compressed);
            network_id++;
            first_n = false;
        }

        num_clusts += 1;
    }
}

// On-click for the general window to hide info of non-clicked elements
window.addEventListener("click", function (e) {
    if (!clickedInsideNetwork) {
        // Re-hide hidden info elements
        for (var info of revealedNodes) {
            info.style.display = "none";
        }

        revealedNodes.clear();
    }

    // De-select unselected networks
    for (var i = 0; i < networks.length; i++) {
        var container = network_containers[i]
        var network = networks[i]

        if (!container.contains(e.target)) {
            network.unselectAll();
        }
    }

    clickedInsideNetwork = false;
});

// Prep pattern script
load_pattern_data();

// Fetch contrasteed results file and load the results to the page
var patterns_contrasted = null;
var patterns_all = null;
var client = new XMLHttpRequest();
var tot_loaded_files = 0

async function load_data(contrasted_file, all_file) {
    const response = await fetch(contrasted_file);

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }

    const response2 = await fetch(all_file);
    if (!response2.ok){
        throw new Error(`HTTP error: ${response2.status}`);
    }

    patterns_contrasted = await response.text();
    patterns_all = await response2.text();
}

// const path1 = 
const CONTRAST_FL = "./data/clustered_contrasted_final_results_CONTRAST_PREFIX.txt";
const ALL_FL = "./data/clustered_contrasted_final_results_BH_PREFIX.txt";

await load_data(CONTRAST_FL, ALL_FL);
build_network(SORT_TYPE.LENGTH);