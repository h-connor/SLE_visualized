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
}

class SequenceItemset {
  constructor(items) {
    this.items = items;
    this.window = items[0].window
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
    this.length = itemsets.length
    this.itemsets = itemsets;
    this.num_patients = num_p;
    this.median_diag_dist = med_diag;
    this.p_value = 0; // TODO: Calculate P-value here
    this.odds_ratio = getRatiosForSeq(this)
    this.growth_rate = getGR(this)
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
  return `${start}-${end}M`;
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

    return seqs;
}