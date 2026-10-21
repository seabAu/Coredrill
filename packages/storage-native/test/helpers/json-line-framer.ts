/** Test-process framing only: preserve partial records until an actual LF arrives. */
export class JsonLineFramer {
  private fragments: string[] = [];

  public consume(chunk: string, onLine: (line: string) => void): void {
    let start = 0;
    let newline = chunk.indexOf("\n", start);
    while (newline >= 0) {
      const suffix = chunk.slice(start, newline);
      this.fragments.push(suffix);
      const line = this.fragments.join("");
      this.fragments = [];
      onLine(line);
      start = newline + 1;
      newline = chunk.indexOf("\n", start);
    }
    if (start < chunk.length) this.fragments.push(chunk.slice(start));
  }
}
