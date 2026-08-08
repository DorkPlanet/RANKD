// The five bars under the wordmark.
//
// They were a literal in DuelScreen's header, which was fine while the header
// was the only thing that drew them. The export card draws them too, and brand
// colours copied into two files are brand colours that drift — so they live
// here and both read from the same array.

export const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"] as const;
