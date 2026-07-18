-- ============================================================
-- REINICIAR DATOS DE PRUEBA (ejecutar en el SQL Editor de Supabase)
-- Borra todo el movimiento (RQs, facturas, salidas, préstamos,
-- solicitudes, stock inicial). NO toca catálogo, proveedores,
-- proyectos ni usuarios.
-- Usar SOLO durante las pruebas, antes de arrancar el piloto real.
-- ============================================================
truncate table
  public.factura_items,
  public.facturas,
  public.salidas,
  public.prestamos,
  public.stock_inicial,
  public.solicitudes_material,
  public.rq_items,
  public.rqs
restart identity cascade;
