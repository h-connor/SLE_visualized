// Source - https://stackoverflow.com/a/7352694
// Posted by Ariel, modified by community. See post 'Timeline' for change history
// Retrieved 2026-06-14, License - CC BY-SA 3.0

import { Scanner } from "./scanner.js";
import { getRatiosForSeq, getGR } from "./metrics.js";

const CAT_SHORT = './data/category_shortener.json'
var category_shortener;

// Minimum support allowed before problems arise
// TODO: Need to differentiate between < 6 and == 6 (I currently do not)
export const MIN_ALLOWED_SUP = 6; 


// TODO / FIXME
// Currently I say anything with controls 6 or 7 will be higher than the previous.
// This is true, however, I need to limited it to 6 not 7, and differentiate between less than 6 or equal to 6.

export async function load_pattern_data() {
    const response = await fetch(CAT_SHORT);

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }

    category_shortener = await response.json();
}

class SequenceItem {
  constructor(value, window) {
    this.value = (value in category_shortener) ? category_shortener[value] : value;
    this.window = window;
  }

  toString(){
    return this.value;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toString();
  }

  hash() {
    return this.value;
  }
}

class SequenceItemset {
  constructor(items) {
    this.items = items;
    this.window = items[0].window;
    this.length =  this.items.length;
  }

  get_item(indx){
    return this.items[indx];
  }

  toString(){
    var ret = "";

    for (var item of this.items)
      ret += item.toString();

    return ret;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() { // For inspection of this itemset
    return this.toString();
  }

  shortened_str() {
    var res = "";

    for (var i = 0; i < this.items.length; i++) {
      var item = this.items[i];

      if (i != 0)
        res += " + ";

      res += item.value.slice(0, 2);
    }

    return res;
  }

  toString() {
    return this.items.map(item => item.toString()).join("|");
  }

  key() { // As a key for maps
    return `${this.window}:${this.items.map(x => x.toString()).join("|")}`;
  }

  Equals(other){
    var ret = this.items.length == other.items.length && this.window == other.window

    if (ret)
    {
      // Compare if the itemsets are equal
      for (var i = 0; i < this.items.length; i++)
      {
        const this_i = this.items[i]
        const oth_i = other.items[i]

        if (this_i.value != oth_i.value) {
          ret = false;
          break
        }
      }

    }

    return ret
  }

  name_str() {
    const res = [];
    for (const item of this.items) {
      res.push(item.value);
    }
    return res.join(", ");
  }
}

export class Sequence {
  constructor(itemsets, num_p, med_diag, cluster_num, init=true) {
    this.length = itemsets.length;
    this.itemsets = itemsets;
    this.num_patients = num_p;
    this.median_diag_dist = med_diag;
    this.cluster = cluster_num;

    if (init) { // Re-calculate?
      this.odds_ratio = getRatiosForSeq(this);
      this.odds_ratio_range = [-1, this.odds_ratio];

      // If we hit the minimum privacy limit, get a lower-bound on the odds ratio
      if (this.num_patients[1] == MIN_ALLOWED_SUP)
      {
        this.odds_ratio_range[0] = getRatiosForSeq(this, this.num_patients[0], 1);
      }

      this.growth_rate = getGR(this);
    }
    else {
      this.odds_ratio_range = null;
      this.odds_ratio = null;
      this.growth_rate = null;
    }

    this.subset_link = null;
    this.super_set_links = [];
    this.upper_level = true;
    this.first_subset_link = null;
    this.is_contrastive = true; // FIXME assign false when not contrastive
    this.network_level = 1; // Y-axis level associated with a network
  }

  add_subset_link(subset, index) {
    if (this.subset_link === null)
      this.subset_link = new Map();

    this.subset_link.set(index, subset);
  }

  get_subset_by_seq_indx(indx) {
    /* given an index, get the copy of the subset of the sequence at that index (if available) 
       
       If none is found, simply return this sequence instead.

       For example, given A -> B -> C
       A -> B is indx of 1
       A is indx of 0
       A -> B -> C is indx of 2
    */

    if (indx == this.length - 1)
      return this;

    if (indx >= this.length)
      return undefined;
  
    // Found something by the given index
    if (this.subset_link !== null && this.subset_link.has(indx))
      return this.subset_link.get(indx);

    // Search for the lowest find we can that is atleast as large as the indx
    var lowest_find = this;
    var lowest_key = this.length - 1;

    if (this.subset_link !== null) {
      for (var key of this.subset_link.keys()) {
        if (key >= indx && key < lowest_key)
        {
          lowest_key = key;
          lowest_find = this.subset_link.get(key);
        }
      }
    }

    return lowest_find;
  }

  Copy(){
    var ret = new Sequence(this.itemsets, this.num_patients, this.median_diag_dist, this.cluster, false);
    
    // Setup copied properties
    ret.odds_ratio = this.odds_ratio;
    ret.growth_rate = this.growth_rate;
    ret.subset_link = this.subset_link;
    ret.super_set_links = this.super_set_links;
    ret.upper_level = this.upper_level;
    ret.first_subset_link = this.first_subset_link;
    ret.is_contrastive = this.is_contrastive;
    ret.network_level = this.network_level;
    ret.odds_ratio_range = this.odds_ratio_range;

    return ret;
  }

  Equals(other) {
    var eq = this.length == other.length;

    if (eq) { 
      for (var i = 0; i < this.length; i++) {
        eq = this.get_item(i).Equals(other.get_item(i));

        if (!eq)
          break;
      }
    }

    return eq;
  }

  get_item(indx){
    return this.itemsets[indx];
  }

  shortened_str(){
    // Shorter variation of the sequence summary
    var ret = "";

    for (var i = 0; i < this.itemsets.length; i++)
    {
      var item = this.itemsets[i];
      ret += item.shortened_str() + " ";

      if (i != this.itemsets.length - 1)
        ret += "-> " + windowToTimelineMonths(item.window) + " -> ";
    }

    return ret
  }

  toString(){
    // To string this object
    var ret = "";

    for (var item of this.itemsets)
      ret += '\{' + item.toString() + '\} ';

    return ret;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toString();
  }

  get_lower_level_by_indx(indx) {
    /*
        Return the sequence from subset_links that is relative to the given index
        For example, given A -> B -> C
          Return A if indx is 0, A -> B if indx is 1, etc..
    */
  }

  [Symbol.iterator]() {
    let index = 0;
    const data = this.itemsets;

    return {
      next() {
        if (index < data.length) {
          return { value: data[index++], done: false };
        }
        return { done: true };
      }
    };
  }
}

export function get_earliest_node(node)
{
    var cur_node = node;
    var prev_node = node.prev;

    while (prev_node !== null)
    {
        cur_node = prev_node;
        prev_node = prev_node.prev;
    }

    return cur_node;
}

function find(str, sub, start = 0, end = str.length) {
    // Javascript equivalent to pythons string.find

  if (start < 0) start = 0;
  if (end > str.length) end = str.length;
  const idx = str.slice(start, end).indexOf(sub);
  return idx === -1 ? -1 : idx + start;
}

function get_num_between(string_val, start_char, stop_char, keep_as_str){
    // Get a number between two character (e.g., (2) the number 2 between brackets)

    var start = find(string_val, start_char) + 1
    var end = find(string_val, stop_char, start)

    if (!keep_as_str) {
        try {
            var res = parseInt(string_val.slice(start, end))
        } catch(Exception){
            var res = string_val.slice(start, end)
        }
    }
    else {
        var res = string_val.slice(start, end)
    }

    return res
}

// Convert sequence string into Sequence structure
function get_seq_items_from_str(sequenceStr) {
  sequenceStr = sequenceStr.trim();
  var res = []
  var index = 0
  var start = find(sequenceStr, '{', index)

  while (start != -1) {
    var end = find(sequenceStr, '}', start + 1)

    var full_itemset = sequenceStr.slice(start + 1, end)
    var items = full_itemset.split(',')

    var seq_items = []
    for (let item of items) {
        var ccs_cat = item.slice(0, find(item, '['))
        var window = get_num_between(item, '(', ')', false)
        seq_items.push(new SequenceItem(ccs_cat, window))
    }

    res.push(new SequenceItemset(seq_items))
    start = find(sequenceStr, '{', end)
  }

  return res;
}

function get_dt_from_str(str_repr) {
    // Given a date in the form [x, y, z, (w, q)]
    // Return a list of list with the values  ["x","y","z",["q","w"]]

    // Swap parenthesis for brackets
    const jsonReady = str_repr.replace(/\(/g, "[").replace(/\)/g, "]")
        .replace(/([^\s\[\],]+)/g, '"$1"') // Make valid json
    
    return JSON.parse(jsonReady)
}

// Parse medical date pairs
function get_med_dates_from_str(med_dates_str) {
    med_dates_str = med_dates_str.trim();
    
    var [case_dts, control_dts = ""] = med_dates_str.split("-");

    return [get_dt_from_str(case_dts), get_dt_from_str(control_dts)];
}

// Parse frequency string: "[x vs y] = [x% vs y%]"
function get_freq_str(str_freq) {

  // Organize string into [x y]
  str_freq = str_freq.trim();
  str_freq = str_freq.split('=')[0]
  str_freq = str_freq.replace(' ', '').replace('vs', ' ')

  const sc = new Scanner(str_freq);
  sc.nextChar(); // '['
  const num_g1 = sc.nextInt();
  sc.nextChar(); // skip ' ' between the ints
  const num_g2 = sc.nextInt();

  return [num_g1, num_g2];
}

// Convert window to timeline string
export function windowToTimelineMonths(window) {
  const start = window * 6;
  const end = start + 6;
  return `${start}-${end}`;
}

function is_ordered_subset(p_sup, p_sub) {
    /*
        Returns true if potential_sup is a immediate subset of potential_sub, regardless of order

        For example, A -> C is a subset of A -> C -> B
    */

    var num_matches = 0;
    var num_trials = p_sub.length;
    for (var i = 0; i < num_trials; i++) { // Go through each subset itemset
        var sub_itemset = p_sub.get_item(i);
        var itemsetSup = p_sup.get_item(i);

        var found_match = false;
        if (itemsetSup.Equals(sub_itemset)) {
            found_match = true;
            num_matches = num_matches + 1;
          }

        if (!found_match) return false;
    }
      
  return num_matches === num_trials
}

function get_maximal_seqs(seqs) {
  // Return the maximal sequences and assign references to the subsets for each sequence

  // Put together the maximal sequences
  // First, setup a dictionary relative to the lengths
  const length_dict = new Map();
  var lengths_sorted = new Set();

  for (var seq of seqs) {
    if (seq.length in length_dict) length_dict[seq.length].push(seq);
    else length_dict[seq.length] = [seq];

    lengths_sorted.add(seq.length);
  }

  lengths_sorted = Array.from(lengths_sorted).sort();
  lengths_sorted.reverse();

  const maximal_seqs = []
  
  // Now, go through each sequence in reverse order of the lengths
  // Check the previous length for any immediate supersets
  var prev_len = null;
  var first_len = null;
  for (var cur_len of lengths_sorted)
  {
    var cur_len_sequences = length_dict[cur_len];

    // Initial start, no previous length 
    if (prev_len === null) {
      prev_len = cur_len;
      first_len = prev_len;

      // All of these are maximal
      for (var cur_seq of cur_len_sequences)
        maximal_seqs.push(cur_seq)

      continue;
    }

    // For each sequence of this length, check if we have anything in the 'upper level'
    // If we do, assign it as a subset
    for (var cur_seq of cur_len_sequences)
    {
      var found_upp = false;

      // First check our maximal seqs for an upper-level match
      // If we don't find any, then check for other potential matches
      for (var pot_upper of maximal_seqs){
        if (is_ordered_subset(pot_upper, cur_seq))
          {
            // Found a superset
            pot_upper.add_subset_link(cur_seq, cur_seq.length - 1);
            cur_seq.upper_level = false;
            cur_seq.super_set_links.push(pot_upper);
            found_upp = true;
          }
      }

      if (!found_upp)
      { // Did not find anything from maximal.
        // Try the +1 lengths instead
        for (var pot_upper of length_dict[prev_len])
        {
            if (is_ordered_subset(pot_upper, cur_seq))
            {
              if (pot_upper.subset_link !== null) throw new Error ("Null expected.");

              // Found a superset
              pot_upper.add_subset_link(cur_seq, cur_seq.length - 1);
              cur_seq.upper_level = false;
              cur_seq.super_set_links.push(pot_upper);
              maximal_seqs.push(pot_upper);
              found_upp = true;
            }
        }

        if (!found_upp) {
          maximal_seqs.push(cur_seq);
        }
      }
    }

    prev_len = cur_len;
  }

  return maximal_seqs
}

class NetworkNode {

  static num_nodes = 0;

  constructor(seq, on_original_path=false) {
    this.value = seq;
    this.next_nodes = [];
    this.prev = null;
    this.on_path = on_original_path;

    this.node_id = NetworkNode.num_nodes;
    NetworkNode.num_nodes += 1;
  }

  add_to_next(seq_value, on_original_path=false) {
    // Add the value as a next node to this node
    // Returns the inserted node

    var n_node = new NetworkNode(seq_value, on_original_path);
    n_node.prev = this;

    this.next_nodes.push(n_node);
    return n_node;
  }
}

class SequenceNetwork {
  // A network of sequences that can branch off into different areas
  // Stores references of the sequences. Requires the use of MAXIMAL sequences that retain references to subsets.

  static num_networks = 0;

  constructor(seq) {
    this.head = new NetworkNode(seq, true);
    this.central_seq = seq;
    this.max_level = 1;

    this.network_id = SequenceNetwork.num_networks;
    SequenceNetwork.num_networks += 1;
  }
}

function get_common(cur_seqs, index) {
  // Return a list with: (a) the sequences with a common element at the given index
  // And (b) Sequences with no common element (i.e., they are alone with nothing similar)

  var common_s_q = new Map(); // Tracking sequences with common itemsets

   // initialize the first event
   // Track which ones are in common to another
   for (var seq of cur_seqs) {
      if (index >= seq.length) {
        continue; // Skip what we cannot obtain
      }

      var element = seq.get_item(index).key();

      // Track with [itemset] : [common maximal sequences]
      if (common_s_q.has(element)) 
        common_s_q.get(element).push(seq);
      else
        common_s_q.set(element, [seq]);
   }

  var alone_seqs = []
  common_s_q.forEach((value, key) => {
      if (value.length == 1) {
        alone_seqs.push([key, value[0]]);
      }
   })

   return [common_s_q, alone_seqs]
}

function get_larger(seq1, seq2) {
  // Return the larger of the two sequence lengths
  // If lengths are the same then return seq1

  return (seq2.length > seq1.length) ? seq2 : seq1;
}

function get_primary_path(sequences) {
  // Return the primary path from a group of sequences
  // This is the LONGEST contrastive sequence in the group
  // If no contrastive sequences exist, then it is the longest

  var prime_path = null;
  var opt_longest = null;
  for (let seq of sequences) {
    
    // Fetch longest contrastive sequence
    if (seq.is_contrastive)
    {
        if (prime_path === null)
          prime_path = seq;
        else 
          prime_path = get_larger(prime_path, seq);
    }

    // Fetch longest sequence
    if (opt_longest === null)
      opt_longest = seq;
    else
      opt_longest = get_larger(opt_longest, seq);
  }

  return (prime_path === null) ? opt_longest : prime_path;
}

function longer_node_network(cur_sequences, current_sets_in_common, all_networks, 
  current_network=null, primary_path=null, primary_path_node=null, network_level=1) {
  /* Given maximal sequences, get networks with ones with x common sequences

     Return the networks and the maximal sequences not included in a network
  */

  // Get all sequences in common for this length
  var [common_s_q, alone_seqs] = get_common(cur_sequences, current_sets_in_common - 1);

  // Remove no-longer needed seqs and create their networks
  // Sequences that are alone do not have anything in common at the given length
  // {Common - 1} is how many elements are in common.
  if (current_network === null) {
    for (var key_p of alone_seqs) {
      var [key, value] = key_p;

      var init_node_seq = value.get_subset_by_seq_indx(current_sets_in_common - 1).Copy()
      var n_network = new SequenceNetwork(init_node_seq)
      all_networks.push(n_network);

      // Add the sequence to the central path
      var cur_node = n_network.head;
      var cur_index = current_sets_in_common;

      while (cur_index < value.length) {
          var n_item = value.get_subset_by_seq_indx(cur_index).Copy();

          n_item.network_level = 1;
          cur_node = cur_node.add_to_next(n_item, true);

          cur_index += 1;
        }

      common_s_q.delete(key);
    }
  }

  var cur_level = network_level;

  // Repeat this process with sequences that have more common elements (i.e., each network)
  for (let common_seqs of common_s_q.values()) {

    for (var i of common_seqs)
      if (i.toString().includes("{Anemia|hematologic} {Anemia}"))
        console.log('hi');

    if (current_network === null) { // First case: Get the sequence of the first itemset
      var n_path = get_primary_path(common_seqs);
      n_path.network_level = network_level;
      var next_network = new SequenceNetwork(n_path.get_subset_by_seq_indx(0).Copy());
      var n_node = next_network.head;
      all_networks.push(next_network);
    
      longer_node_network(common_seqs, current_sets_in_common + 1, all_networks, 
      next_network, n_path, n_node, network_level);

    } else {

      var add_to_node = primary_path_node;
    
      // Everything grouped together is following the same path
      var n_item = common_seqs[0].get_subset_by_seq_indx(current_sets_in_common - 1).Copy();
      var on_primary_path = n_item.get_item(current_sets_in_common - 1).Equals(primary_path.get_item(current_sets_in_common - 1));

      // Append the common sequence to the current network
      // NOTE: Will use the full sequence if the subset is not found
      if (common_seqs.length > 1) 
      { 

        // We have more sequences in common along this path
        if (on_primary_path)
        {
          // Following the current path
          var n_path = primary_path
          n_item.network_level = n_item.network_level;
          var n_node = add_to_node.add_to_next(n_item, n_item.network_level == 1);
        }
        else {
          // Break onto a new path
          network_level += 1;
          var n_path = get_primary_path(common_seqs);
          n_item.network_level = network_level;
          var n_node = add_to_node.add_to_next(n_item, n_item.network_level == 1);          
        }

        current_network.max_level = Math.max(current_network.max_level, cur_level); // Track highest level overall
        longer_node_network(common_seqs, current_sets_in_common + 1, all_networks, 
        current_network, n_path, n_node, network_level);
      }
      else {
        var add_indx = current_sets_in_common - 1
        var node_level = null;

        if (!on_primary_path) {
          cur_level += 1;
          node_level = cur_level;
        } else {
          node_level = network_level;
        }

        current_network.max_level = Math.max(current_network.max_level, cur_level); // Track highest level overall

        // This sequence stands alone from here. Add it as a branch and move on.
        while (add_indx < common_seqs[0].length)
        {
          var n_item = common_seqs[0].get_subset_by_seq_indx(add_indx).Copy();

          n_item.network_level = node_level;
          add_to_node = add_to_node.add_to_next(n_item, n_item.network_level == 1);

          add_indx += 1;
        }
      }
    }
  }
}

function get_compressed_seqs(maximal_seqs) {
  /*
      Configure a sequential branching network

      If for example two sequences start with examination, then we track both maximal sequences together

      This way they can be display on a single network that branches off from the initial examination.
  */
  
  var networks = [];
  longer_node_network(maximal_seqs, 1, networks);
  return networks;
}

// Build all Sequence objects from file
export function build_objs(pattern_raw, compress=false) {
    const seqs = [];
    const PAT_SEP = ":";

    // Cut duplicate lines
    var lines = [...new Set(pattern_raw.split("\n"))];

    for (const line of lines) {
        
        if (!line.trim()) 
            continue;

        const [seq_str, med_dates_str, freq_str, cluster] = line.trim().split(PAT_SEP);
        
        const med_dates = get_med_dates_from_str(med_dates_str);
        const seq = get_seq_items_from_str(seq_str);
        const freq = get_freq_str(freq_str);
        var res_s = new Sequence(seq, freq, med_dates, cluster)

        if (! seqs.some(x => x.Equals(res_s))) // duplicate check
          seqs.push(res_s);
    }

    const maximal_seqs = get_maximal_seqs(seqs);
    var res = maximal_seqs;

    if (compress)
      res = get_compressed_seqs(maximal_seqs);
    else {
      // Nothing to compress, use the raw sequences instead
      var n_res = []
      for (var seq of maximal_seqs)
        n_res.push(new SequenceNetwork(seq));
      res = n_res;
    }

    return res;
}