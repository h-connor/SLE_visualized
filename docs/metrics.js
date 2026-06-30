export const TOT_SLE = 541;
export const TOT_CONTROLS = 2625;

const MAX_RATIO = 9999999

function getUpper95CI(a, b, c, d, OR) {
    if (c == 0)      return MAX_RATIO;
    else if (a == 0) return -MAX_RATIO;

    const root = Math.sqrt((1.0 / a) + (1.0 / b) + (1.0 / c) + (1.0 / d))
    const exp = Math.log(OR) + 1.96 * root

    return Math.pow(Math.E, exp)
}

function getLower95CI(a, b, c, d, OR) {
    if (c == 0)      return MAX_RATIO;
    else if (a == 0) return -MAX_RATIO;

    const root = Math.sqrt((1.0 / a) + (1.0 / b) + (1.0 / c) + (1.0 / d))
    const exp = Math.log(OR) - 1.96 * root

    return Math.pow(Math.E, exp)
}

function getRatio(a, b, c, d) {
    if (c == 0)      return MAX_RATIO;
    else if (a == 0) return -MAX_RATIO;

    const odds_in_exposed_group = a / b;
    const odds_in_not_exposed_group = c / d;

    return odds_in_exposed_group / odds_in_not_exposed_group
}

export function getRatiosForSeq(sequence, case_patients_override = -1, control_patients_override = -1) {
    // Returns the ratios in the form [lower 95% CI, ratio, upper 95% CI]

    // Calculates the odds ratio
    const a = (case_patients_override == -1) ? sequence.num_patients[0] : case_patients_override;
    const b = TOT_SLE
    const c = (control_patients_override == -1) ? sequence.num_patients[1] : control_patients_override;
    const d = TOT_CONTROLS

    var ratio = getRatio(a, b, c, d);
    const upper = (getUpper95CI(a, b, c, d, ratio)).toFixed(2);
    const lower = (getLower95CI(a, b, c, d, ratio)).toFixed(2);
    ratio = (ratio).toFixed(2); // Round resulting ratio after

    return [lower, ratio, upper]
}

export function getGR(sequence, case_patients_override = -1, control_patients_override = -1) {

    var cases = (case_patients_override == -1) ? sequence.num_patients[0] / TOT_SLE : case_patients_override / TOT_SLE;
    var controls = (control_patients_override == -1) ? sequence.num_patients[1] / TOT_CONTROLS : control_patients_override / TOT_CONTROLS;

    return (cases / controls).toFixed(2)
}