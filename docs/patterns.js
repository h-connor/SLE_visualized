// Source - https://stackoverflow.com/a/7352694
// Posted by Ariel, modified by community. See post 'Timeline' for change history
// Retrieved 2026-06-14, License - CC BY-SA 3.0

import { Scanner } from "./scanner.js";
import { getRatiosForSeq, getGR } from "./metrics.js";

const PATS_FILE = "../data/_contrasted_final_results.txt";
const CAT_SHORT = '../data/category_shortener.json'

const resp = await fetch(CAT_SHORT);
const category_shortener = await resp.json();

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
  constructor(itemsets, num_p, med_diag) {
    this.length = itemsets.length;
    this.itemsets = itemsets;
    this.num_patients = num_p;
    this.median_diag_dist = med_diag;
    this.odds_ratio = getRatiosForSeq(this);
    this.growth_rate = getGR(this);
    this.subset_link = null;
    this.super_set_links = [];
    this.upper_level = true;
    this.first_subset_link = null;
    this.is_contrastive = true; // FIXME assign false when not contrastive
  }

  add_subset_link(subset, index) {
    if (this.subset_link === null)
      this.subset_link = new Map();

    this.subset_link.set(index, subset);
  }

  get_subset_by_seq_indx(indx) {
    /* given an index, get the subset of the sequence at that index (if available) 
       
       If none is found, simply return this sequence instead.

       For example, given A -> B -> C
       A -> B is indx of 1
       A is indx of 0
       A -> B -> C is indx of 2
    */

    if (this.subset_link !== null && this.subset_link.has(indx))
      return this.subset_link.get(indx);

    return this;

    // var cur_seq = this;
    // var cur_indx = this.length - 1;
    // while (cur_indx >= 0 & cur_seq !== null)
    // {
    //    if (indx == cur_indx)
    //       return cur_seq;

    //    cur_indx--;
    //    cur_seq = this.subset_link;
    // }

    // return this;
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

        if (!found_upp)
          maximal_seqs.push(cur_seq);
      }
    }

    prev_len = cur_len;
  }

  return maximal_seqs
}

class NetworkNode {
  constructor(seq) {
    this.value = seq;
    this.next_nodes = [];
    this.prev = null;
  }

  add_to_next(seq_value) {
    // Add the value as a next node to this node
    // Returns the inserted node

    var n_node = new NetworkNode(seq_value);
    n_node.prev = this;

    this.next_nodes.push(n_node);
    return n_node;
  }
}

class SequenceNetwork {
  // A network of sequences that can branch off into different areas
  // Stores references of the sequences. Requires the use of MAXIMAL sequences that retain references to subsets.

  constructor(seq) {
    this.head = new NetworkNode(seq);
    this.central_path = seq;
  }
}

function get_common(cur_seqs, index) {
  // Return a list with: (a) the sequences with a common element at the given index
  // And (b) Sequences with no common element (i.e., they are alone with nothing similar)

  var common_s_q = new Map(); // Tracking sequences with common itemsets

   // initialize the first event
   // Track which ones are in common to another
   for (var seq of cur_seqs) {
      if (index >= seq.length)
        continue; // Skip what we cannot obtain

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
  current_network=null, primary_path=null, primary_path_node=null) {
  /* Given maximal sequences, get networks with ones with x common sequences

     Return the networks and the maximal sequences not included in a network
  */

  // Get all sequences in common for this length
  var init = get_common(cur_sequences, current_sets_in_common - 1);
  var common_s_q = init[0];

  if (current_sets_in_common == 2){
    var x = 2;

  }

  // Remove no-longer needed seqs and create their networks
  // Sequences that are alone do not have anything in common at the given length
  // {Common - 1} is how many elements are in common.
  if (current_network === null) {
    var alone_seqs = init[1];
    for (var key_p of alone_seqs) {
      var [key, value] = key_p;
      all_networks.push(new SequenceNetwork(value));

      common_s_q.delete(key);
    }
  }

  // Repeat this process with sequences that have more common elements (i.e., each network)
  for (let common_seqs of common_s_q.values()) {
    if (current_network === null) { // First case: Get the sequence of the first itemset
      var next_network = new SequenceNetwork(common_seqs[0].get_subset_by_seq_indx(0));
      all_networks.push(next_network);
      primary_path = get_primary_path(common_seqs);
      primary_path_node = next_network.head;
    
      longer_node_network(common_seqs, current_sets_in_common + 1, all_networks, 
      next_network, primary_path, primary_path_node);

    } else {

      var add_to_node = primary_path_node;
      var seq = common_seqs[0]; // Will use the first sequence as a basis

      // In this case everything grouped together is following the same path
      // Anything in a separate loop iteration is a different path
      var n_item = seq.get_subset_by_seq_indx(current_sets_in_common - 1);

      // Append the common sequence to the current network
      // NOTE: Will use the full sequence if the subset is not found
      if (common_seqs.length > 1) 
      { // We have more sequences in common along this path
        if (n_item.get_item(current_sets_in_common - 1).Equals(primary_path.get_item(current_sets_in_common - 1)))
        {
          // Following the current path
          primary_path_node = add_to_node.add_to_next(n_item);
        }
        else {
          // Break onto a new path
          primary_path = get_primary_path(common_seqs);
          primary_path_node = add_to_node.add_to_next(n_item);
        }

        longer_node_network(common_seqs, current_sets_in_common + 1, all_networks, 
        current_network, primary_path, primary_path_node);
      }
      else {
        var add_indx = current_sets_in_common - 1

        // This sequence stands alone from here. Add it as a branch and move on.
        while (add_indx < seq.length)
        {
          add_to_node = add_to_node.add_to_next(n_item);
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

        const [seq_str, med_dates_str, freq_str] = line.trim().split(PAT_SEP);
        
        const med_dates = get_med_dates_from_str(med_dates_str);
        const seq = get_seq_items_from_str(seq_str);
        const freq = get_freq_str(freq_str);
        var res_s = new Sequence(seq, freq, med_dates)

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