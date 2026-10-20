-- Bloque 39 · Material (texto e imagen: barra, agarre…) y descripción adicional en los ejercicios de los programas
alter table ejercicios add column if not exists material text;          -- material por defecto del ejercicio (biblioteca)
alter table ejercicios_sesion add column if not exists material text;   -- material propio de este ejercicio en este programa (manda sobre el de la biblioteca)
alter table ejercicios_sesion add column if not exists nota text;       -- descripción adicional opcional que ve el alumno
alter table ejercicios add column if not exists material_img_url text;          -- imagen del material por defecto (biblioteca)
alter table ejercicios_sesion add column if not exists material_img_url text;   -- imagen propia en este programa ('' = sin imagen aquí aunque la biblioteca tenga)
