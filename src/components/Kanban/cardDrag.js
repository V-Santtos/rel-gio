// Cards que chegaram numa coluna pelo arraste do modo Padrao (App.jsx). O
// DayLane consulta este Set para NAO disparar o "pop" de card novo: o proprio
// arraste ja encaixou o card no lugar com animacao.
export const quietArrivals = new Set();
