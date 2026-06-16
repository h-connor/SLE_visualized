import { build_objs, windowToTimelineMonths } from "./patterns.js";
import { TOT_SLE, TOT_CONTROLS } from "./metrics.js";
const revealedNodes = new Set(); // Nodes set to visible / clicked on
var clickedInsideNetwork = false;

var networks = [];
var network_containers = [];

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
    if (len < 5) return 24;
    if (len < 10) return 22;
    if (len < 15) return 18;
    if (len < 20) return 17;
    if (len < 25) return 15;
    if (len < 40) return 14;

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

    console.log(n_sequences.length)
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
}

export function build_network(sort_method, desc=true) 
{
    // Clear previous network (if any)
    clear_net();

    // Pyscript: Build the sequences
    var sequences = build_objs(pattern_raw);
    sequences = sort_sequences(sequences, sort_method)
    console.log(sequences[0].length)

    if (!desc) sequences.reverse();

    const graph_layer = document.getElementById("graph");
    const container = document.getElementById("network_body");
    const panel_parent = document.getElementById("infoPanel");

    var cur_node_id = 0;
    var cur_edge_id = 0;
    var network_id = 0;

    var network_options = {
        layout: {
            hierarchical: { 
                enabled: true, 
                direction: "LR",
                levelSeparation: 200
            }
        },
        physics: {
            enabled: false
        },
        interaction: { dragNodes: false, dragView: false, zoomView: false },
        nodes: {
            shape: 'box',
            margin: 3,
            size:25,
            widthConstraint: 95,
            heightConstraint: 65,
            font: {
                size: 18,
                multi: true
            }
        }
    };

    for(let seq of sequences){
        console.log(seq)
        var node_names = [];
        var edges = [];

        // Creates nodes and edges 
        // Edge: 1st itemset -> next -> until end of sequence
        // Node: Itemset
        var first_n = true;
        var prev_id = -1
        
        for (let itemset of seq){
            var label_text = itemset.name_str()

            node_names.push( 
                {   // Properties of a node 
                    id: cur_node_id, label: label_text,
                    font: {
                        size: getFontSize(label_text)
                    }
                });

            if (! first_n){
                prev_id = cur_node_id - 1;
                
                edges.push( 
                    {  // Properties of an edge
                        id: cur_edge_id, from: prev_id, to: cur_node_id, 
                        arrows: { to: { enabled: true, type: 'arrow' } },
                        label: windowToTimelineMonths(itemset.window), // edge label text
                        font: { align: 'center', size: 15, color: '#000' }, // label style
                        scaling: { label: true },
                        width:1,
                        smooth:false
                    }
                );
            }

            first_n = false;
            ++cur_node_id;
            ++cur_edge_id;
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
        const slePct = (seq.num_patients[0] / TOT_SLE * 100).toFixed(1)
        const controlPct = (seq.num_patients[1] / TOT_CONTROLS * 100).toFixed(1)

        info_element.innerHTML = `
            <div class="network-stats">
                <div class="group left">
                    <strong>${seq.num_patients[0]}</strong>
                    <span>(${slePct}%)</span>
                    <label>SLE</label>
                </div>

                <div class="group right">
                    <strong>${seq.num_patients[1]}</strong>
                    <span>(${controlPct}%)</span>
                    <label>CONTROLS</label>
                </div>
            </div>
        `;

        graph_layer.appendChild(info_element);

        const n_network = new vis.Network(containing_element, data, network_options)
        
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