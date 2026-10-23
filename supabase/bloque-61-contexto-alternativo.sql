-- Bloque 61 · Contexto alternativo: entrenos guardados que el alumno ve siempre en Entreno (p. ej. en casa sin gimnasio)
alter table programas add column if not exists alternativo boolean not null default false;
-- Los contextos «Mancuernas en casa» guardados (Sonia, Inés…) pasan a ser alternativos
update programas set alternativo = true where contexto_nombre = 'Mancuernas en casa' and contexto_desde is null;
