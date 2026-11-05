-- Bloque 93 · El alumno puede leer SUS cuotas (solo lectura) para el recordatorio de pago de las cuotas fraccionadas.
-- No puede crearlas, cambiarlas ni ver las de otros. Si ya existía un permiso igual, no hace nada.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagos' and policyname = 'alumno lee sus pagos') then
    create policy "alumno lee sus pagos" on public.pagos for select to authenticated using (alumno_id = auth.uid());
  end if;
end $$;
