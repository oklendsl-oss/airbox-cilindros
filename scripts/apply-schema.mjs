/**
 * apply-schema.mjs
 * Aplica el schema de AIRBOX usando el cliente Supabase
 * Workaround: crea las tablas usando INSERT + error detection pattern
 * 
 * NOTA: Para aplicar DDL directamente necesitas acceso al SQL Editor del dashboard.
 * Este script verifica el estado y reporta qué falta.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pwybaiuuxuyocbfiubfb.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eWJhaXV1eHV5b2NiZml1YmZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzMDY0MSwiZXhwIjoyMDkxOTA2NjQxfQ.4i_pU2bzEkpsxpyztB1ThZVZf7mYViPxTbHahBnMLLM'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function checkTable(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1)
  if (error && error.code === 'PGRST205') return false // table not found in schema cache
  if (error && error.message.includes('relation') && error.message.includes('does not exist')) return false
  return true
}

async function main() {
  console.log('🔍 Verificando estado de las tablas en Supabase...\n')
  
  const tablas = ['instalaciones', 'zonas', 'tipos_cilindro', 'puertas', 'fotos', 'historial']
  const estado = {}
  
  for (const tabla of tablas) {
    const existe = await checkTable(tabla)
    estado[tabla] = existe
    console.log(`${existe ? '✅' : '❌'} ${tabla}`)
  }
  
  const faltan = tablas.filter(t => !estado[t])
  
  if (faltan.length === 0) {
    console.log('\n✅ Todas las tablas existen. Schema aplicado correctamente.')
    
    // Verificar tipos_cilindro tiene datos
    const { data: tipos } = await supabase.from('tipos_cilindro').select('nombre').order('orden')
    if (tipos && tipos.length > 0) {
      console.log(`\n📋 Tipos de cilindro disponibles (${tipos.length}):`)
      tipos.forEach(t => console.log(`   - ${t.nombre}`))
    }
  } else {
    console.log(`\n⚠️  Faltan ${faltan.length} tabla(s): ${faltan.join(', ')}`)
    console.log('\n📋 Para aplicar el schema, ve al SQL Editor de Supabase:')
    console.log('   https://supabase.com/dashboard/project/pwybaiuuxuyocbfiubfb/sql/new')
    console.log('\n   Y pega el contenido de: ~/airbox-cilindros/scripts/schema.sql')
    console.log('\n   O usa el CLI de Supabase:')
    console.log('   supabase db push --project-ref pwybaiuuxuyocbfiubfb')
  }
  
  return faltan.length === 0
}

main().then(ok => process.exit(ok ? 0 : 1))
