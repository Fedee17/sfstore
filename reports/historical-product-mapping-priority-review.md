# Priorización de mappings históricos

> Análisis de solo lectura. Ningún `final_product_id` o `final_decision` fue modificado.

## Propuestas confirmables Yara

| Nombre histórico | recommended_decision | recommended_product_id | Estado humano |
|---|---|---|---|
| Lattafa Yara Rosa | MATCH | 05b34469-3eb8-4148-8e97-9a19f1c2df6e | MATCH |
| Lattafa Yara rosa | MATCH | 05b34469-3eb8-4148-8e97-9a19f1c2df6e | MATCH |
| Lattafa Yara Tous | MATCH | e53066cc-9c35-47e2-8d27-0fe5fb425ce8 | MATCH |

Los productos duplicados permanecen intactos; la columna Estado humano refleja la decisión vigente del CSV.

## TOP 15 mappings sin resolver por impacto

## Casos CREATE_LATER

| Nombre histórico | Categoría probable | Ventas | Compras | Última fecha | Stock actual inferible | Candidato similar | Recomendación refinada |
|---|---|---:|---:|---|---|---|---|

## Casos REVIEW

| Nombre histórico | Impacto | Candidato 1 | Duda exacta | Recomendación refinada |
|---|---:|---|---|---|

## Casos MATCH sugeridos

| Nombre histórico | Candidato | Categoría | Precios históricos | Costo histórico | Confianza | Evidencia |
|---|---|---|---|---|---|---|

Confianza entre los 10 MATCH sugeridos: HIGH 0, MEDIUM 0, LOW 0.

## Alcance y seguridad

- Los mappings sin decisión final están ordenados por ventas + compras, sin duplicar filas.
- Precio/costo se usa únicamente como señal secundaria.
- Categoría probable se deriva de candidatos actuales; si no hay evidencia, se informa como tal.
- No se infiere stock histórico o actual.
- Operaciones contra Supabase: solo SELECT.
