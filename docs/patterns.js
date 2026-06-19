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
}

class SequenceItemset {
  constructor(items) {
    this.items = items;
    this.window = items[0].window
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

[Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toString();
  }  


  Equals(other){
    var ret = this.items.length == other.items.length & this.window == other.window

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
  }

  get_subset_by_seq_indx(indx) {
    /* given an index, get the subset of the sequence at that index (if available) 
       
       If none is found, simply return this sequence instead.

       For example, given A -> B -> C
       A -> B is indx of 1
       A is indx of 0
       A -> B -> C is indx of 2
    */
    
    var cur_seq = this;
    var cur_indx = this.length - 1;
    while (cur_indx >= 0 & cur_seq !== null)
    {
       if (indx == cur_indx)
          return cur_seq;

       cur_indx--;
       cur_seq = this.subset_link;
    }

    return this;
  }

  get_item(indx){
    return this.itemsets[indx];
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

function is_immed_ordered_subset(p_sup, p_sub) {
    /*
        Returns true if potential_sup is a immediate subset of potential_sub, regardless of order

        For example, A -> C is a subset of A -> C -> B
    */

    // Subset must be exactly 1 itemset smaller than the superset
    if (p_sup.length != p_sub.length + 1) return false;

    var num_matches = 0;
    var num_trials = p_sub.length;
    for (var i = 0; i < num_trials; i++) { // Go through each subset itemset
        var sub_itemset = p_sub.get_item(num_matches);

        var found_match = false;
        var itemsetSup = p_sup.get_item(i);

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
  
  // Now, go through each sequence in reverse order of the lengths
  // Check the previous length for any immediate supersets
  var prev_len = null;
  var first_len = null;
  for (var cur_len of lengths_sorted)
  {
    // Initial start, no previous length 
    if (prev_len === null) {
      prev_len = cur_len;
      first_len = prev_len;
      continue;
    }

    // For each sequence of this length, check if we have anything in the 'upper level'
    // If we do, assign it as a subset
    var cur_len_sequences = length_dict[cur_len];
    for (var cur_seq of cur_len_sequences)
    {
      
      for (var pot_upper of length_dict[prev_len])
      {
          if (is_immed_ordered_subset(pot_upper, cur_seq))
          {
            if (pot_upper.subset_link !== null) throw new Error ("Null expected.");

            // Found a superset
            pot_upper.subset_link = cur_seq;
            cur_seq.upper_level = false;
            cur_seq.super_set_links.push(cur_seq);
            break;
          }
      }
    }

    prev_len = cur_len;
  }

  // Go through all sequences and take only upper levels
  const maximal_seqs = []
  for (var seq of seqs)
  {
    if (seq.upper_level)
      maximal_seqs.push(seq)
  }

  return maximal_seqs
}

// Build all Sequence objects from file
export function build_objs(pattern_raw) {
    const seqs = [];
    const PAT_SEP = ":";

    var lines = pattern_raw.split("\n");

    for (const line of lines) {
        
        if (!line.trim()) 
            continue;

        const [seq_str, med_dates_str, freq_str] = line.trim().split(PAT_SEP);
        
        const med_dates = get_med_dates_from_str(med_dates_str);
        const seq = get_seq_items_from_str(seq_str);
        const freq = get_freq_str(freq_str);

        seqs.push(new Sequence(seq, freq, med_dates));
    }

    const maximal_seqs = get_maximal_seqs(seqs)
    return maximal_seqs;
}