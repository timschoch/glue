// The memory server wraps each member in a spy. In the browser the member
// itself runs.
export const vi = { fn: <TRun>(run: TRun) => run }
