export class Scanner {
  constructor(line) {
    this.line = line;
    this.index = 0;
  }

  nextInt() {
    let val = "";

    for (let i = this.index; i < this.line.length; i++) {
      const ch = this.line[i];

      if (!isNaN(parseInt(ch))) {
        val += ch;
      } else {
        if (val === "") continue;

        this.index = i;
        return parseInt(val, 10);
      }
    }

    this.index = this.line.length;

    return val === "" ? -1 : parseInt(val, 10);
  }

  nextChar() {
    for (let i = this.index; i < this.line.length; i++) {
      const ch = this.line[i];

      if (isNaN(parseInt(ch))) {
        this.index = i + 1;
        return ch;
      }
    }

    this.index = this.line.length;
    return -1;
  }

  nextFloat() {
    const prevIndex = this.index;

    const intValue = this.nextInt();
    const decimalChar = this.nextChar();

    if (decimalChar !== ".") {
      this.index = prevIndex;
      return null;
    }

    let res = String(intValue);
    let firstNum = true;

    for (let i = this.index; i < this.line.length; i++) {
      const ch = this.line[i];

      const digit = parseInt(ch);

      if (!isNaN(digit)) {
        if (firstNum) {
          res += ".";
          firstNum = false;
        }
        res += digit;
      } else {
        this.index = i;
        return parseFloat(res);
      }
    }

    this.index = this.line.length;
    return parseFloat(res);
  }

  nextArr(firstCall) {
    let startIndex = -1;

    for (let i = this.index; i < this.line.length; i++) {
      const ch = this.line[i];

      if (startIndex < 0 && ch === "[") {
        startIndex = i;
      } else if (startIndex >= 0 && ch === "]") {
        const endIndex = i;
        this.index = i + 1;

        let currentStr = this.line.substring(startIndex + 1, endIndex);

        currentStr = currentStr.replace(/\[/g, "").replace(/\]/g, "");

        while (currentStr.includes("  ")) {
          currentStr = currentStr.replace(/  /g, " ");
        }

        currentStr = currentStr.trim();

        // no numbers case
        if (!/[0-9]/.test(currentStr)) {
          return [0, 0, 0, 0];
        }

        if (firstCall) {
          const temp = currentStr.split(" ");
          return [
            Math.round(parseFloat(temp[0]) * 100) / 100,
            Math.round(parseFloat(temp[1]) * 100) / 100,
            Math.round(parseFloat(temp[2]) * 100) / 100,
          ];
        } else {
          const temp = currentStr.split("*");
          return [parseInt(temp[0]), parseInt(temp[1])];
        }
      }
    }

    this.index = this.line.length;
    return [];
  }
}