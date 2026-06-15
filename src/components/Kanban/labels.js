export const LABEL_COLORS = [
  "#4bff5c",
  "#0fffa5",
  "#ff4e00",
  "#ff1a19",
  "#8a10ff",
  "#218057",
  "#ad8b00",
  "#c26800",
  "#c43a32",
  "#8f44ad",
  "#56c596",
  "#d8b40f",
  "#ff9f1a",
  "#ff6b65",
  "#c471ed",
  "#154481",
  "#155e75",
  "#456b17",
  "#7a2454",
  "#5d636b",
  "#186dff",
  "#6bbbd0",
  "#9ccd49",
  "#de64ad",
  "#9aa0a6",
];

export const DEFAULT_LABELS = [
  { id: "red", name: "", color: "#ff1a19" },
  { id: "orange", name: "", color: "#ff4e00" },
  { id: "green", name: "", color: "#4bff5c" },
  { id: "teal", name: "", color: "#0fffa5" },
  { id: "blue", name: "", color: "#186dff" },
  { id: "purple", name: "", color: "#8a10ff" },
];

let runtimeLabels = [...DEFAULT_LABELS];

export const getLabels = () => runtimeLabels;

export const setLabels = (labels) => {
  runtimeLabels = labels;
};

export const labelById = (id) => runtimeLabels.find((label) => label.id === id);
