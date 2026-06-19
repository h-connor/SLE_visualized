import { build_objs, windowToTimelineMonths } from "./patterns.js";
import { TOT_SLE, TOT_CONTROLS } from "./metrics.js";
const revealedNodes = new Set(); // Nodes set to visible / clicked on
var clickedInsideNetwork = false;

var networks = [];
var network_containers = [];
var node_to_seq = new Map();

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
            return seqA.odds_ratio > seqB.odds_ratio;
        case SORT_TYPE.GROWTH:
            return seqA.GROWTH > seqB.GROWTH;

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
        var cur_seq = sequences[i];

        // Go through n_sequences
        var inserted = false;
        for (var k = 0; k < n_sequences.length; k++)
        {
            var comp_seq = n_sequences[k];

            if (sort_method_comp(cur_seq, comp_seq, sort_method)) {
                inserted = true;
                n_sequences.insert(k, cur_seq);
                break;
            }
        }

        if (!inserted)
            n_sequences.push(cur_seq)
    }

    return n_sequences
}

function clear_net(){

    document.querySelectorAll("div.net").forEach(div => {
        div.remove();
    });

    document.querySelectorAll("div.patInfo").forEach(div => {
        div.remove();
    });

    revealedNodes.clear();
    networks.length = 0
    network_containers.length = 0;
    node_to_seq = new Map();
}

const COLORS = {
    low:  [173, 216, 230], // 1 = light blue
    mid:  [0, 102, 204],   // 2 = blue
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
                    visited.add(edge.to);
                    traverse(edge.to);
                }
            }
        }
    }

    traverse(startNode);
    return Array.from(visited);
}

function collapseNode(nodeId, network) {
    const nodesToCollapse = getFutureNodes(nodeId, network);
    nodesToCollapse.push(nodeId);

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
export function build_network(sort_method, desc=true) 
{
    // Clear previous network (if any)
    clear_net();

    // Pyscript: Build the sequences
    var sequences = build_objs(pattern_raw);
    sequences = sort_sequences(sequences, sort_method)

    if (!desc) sequences.reverse();

    const graph_layer = document.getElementById("graph");
    const container = document.getElementById("network_body");
    const panel_parent = document.getElementById("infoPanel");

    var cur_node_id = 0;
    var cur_edge_id = 0;
    var network_id = 0;

    var network_options = {
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
            margin: 3,
            size:40,
            widthConstraint: 70,
            heightConstraint: 65,
            font: {
                size: 18,
                multi: true
            }
        }
    };

    for(let seq of sequences){
        var node_names = [];
        var edges = [];

        // Creates nodes and edges 
        // Edge: 1st itemset -> next -> until end of sequence
        // Node: Itemset
        var first_n = true;
        var prev_id = -1;
        var cur_itemset_pos = 0;
        const width80 = window.innerWidth * 0.8;
        const EDGE_XFACTOR = 5;
        const NO_WIND_RED = 60;
        const DEF_NEXT_ITEMSET_DIST = 170;
        const INIT_POS = (-window.innerWidth / 2) + (72 * 2);

        const RESCALE_AT_LEN = 6 // TODO: Rescale doesnt work with smaller sequences
        var prev_xpos = 0;

        for (let itemset of seq) {
            // The subset that this position in the sequence refers to (if available)
            var subset_seq = seq.get_subset_by_seq_indx(cur_itemset_pos);
            node_to_seq.set(cur_node_id, subset_seq); // Track node -> seq

            // Amount to shift a node by to make the edge longer
            // Scale the smaller sequences by a larger amount (as we have more room)
            var edge_shift = (((seq.len < RESCALE_AT_LEN) ? EDGE_XFACTOR * 2 : EDGE_XFACTOR) * itemset.window) - NO_WIND_RED;
            var label_text = itemset.name_str();

            if (cur_itemset_pos == 0)
                var n_xpos = INIT_POS;
            else
                var n_xpos = prev_xpos + edge_shift + DEF_NEXT_ITEMSET_DIST;

            const gr_color = valueToColor(subset_seq.growth_rate);
            node_names.push( 
                {   // Properties of a node 
                    id: cur_node_id, label: label_text,
                    font: {
                        size: getFontSize(label_text)
                    },
                    x: n_xpos,
                    y: 65,

                    fixed: {
                        x: true,
                        y: true
                    },

                    color: {
                        background: gr_color,
                        border: darkenRGB(gr_color, 0.5)
                    }
                });

            if (! first_n){
                prev_id = cur_node_id - 1;
                
                edges.push( 
                    {  // Properties of an edge
                        id: cur_edge_id, from: prev_id, to: cur_node_id, 
                        arrows: { to: { enabled: true, type: 'arrow', scaleFactor: 0.5 } },
                        label: windowToTimelineMonths(itemset.window), // edge label text
                        font: { align: 'center', size: 15, color: '#000', vadjust: -15 }, // label style
                        scaling: { label: true },
                        width:1,
                        smooth: true
                    }
                );
            }

            first_n = false;
            ++cur_node_id;
            ++cur_edge_id;
            ++cur_itemset_pos;
            prev_xpos = n_xpos
        }

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
        container.appendChild(containing_element);

        // On-click info-element
        const info_element = document.createElement('div');
        info_element.className = 'patInfo';
        info_element.style.position = container.style.position;


        graph_layer.appendChild(info_element);

        const n_network = new vis.Network(containing_element, data, network_options);

        // Set initial network pos (same pos for all)
        n_network.moveTo({
            position: {
                x: 0,
                y: 65
            },
            scale: 1,
            animation: false
        });

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
            const Y_OFFSET = 80

            info_element.style.position = "absolute";
            info_element.style.top = canvasPos.y + rect.top + window.scrollY - Y_OFFSET + "px";
            info_element.style.display = "block";
            
            var ref_seq = node_to_seq.get(nodeId);
            
            // Show pattern info
            const slePct = (ref_seq.num_patients[0] / TOT_SLE * 100).toFixed(1)
            const controlPct = (ref_seq.num_patients[1] / TOT_CONTROLS * 100).toFixed(1)
            info_element.innerHTML = `
                <div class="network-stats">
                    <div class="group left">
                        <strong>${ref_seq.num_patients[0]}</strong>
                        <span>(${slePct}%)</span>
                        <label>SLE</label>
                    </div>

                    <div class="group right">
                        <strong>${ref_seq.num_patients[1]}</strong>
                        <span>(${controlPct}%)</span>
                        <label>CONTROLS</label>
                    </div>
                </div>
            `;

            revealedNodes.add(info_element)
            info_element.style.display = "block";
        });
        
        networks.push(n_network);
        network_containers.push(containing_element)
        network_id++;
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

// Fetch contrasteed results file and load the results to the page
var pattern_raw = null
var client = new XMLHttpRequest();
client.open('GET', 'data/_contrasted_final_results_.txt', true);
client.onreadystatechange = function () {
  if (client.readyState === 4 && client.status === 200) {
    pattern_raw = client.responseText;
  }
};
client.onload = function(){
    build_network(SORT_TYPE.LENGTH);
}
client.send();