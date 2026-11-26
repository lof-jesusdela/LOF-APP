-- Bloque 121 · Métodos: nombre visible (etiqueta) y orden en la lista
alter table metodos add column if not exists etiqueta text;
alter table metodos add column if not exists orden int;
