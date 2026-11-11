/*
  Minglo Selfie — opsætning for hele installationen.

  Udfyld Supabase-felterne for at slå QR-deling og online-galleri til.
  Uden dem virker boothen stadig fuldt ud, men billederne bliver kun gemt på tabletten.
  Se README.md → "QR-deling og online-galleri".

  Nøglen her er Supabase's OFFENTLIGE nøgle (anon / publishable). Den må gerne
  ligge i koden. Læg ALDRIG service_role-nøglen her.
*/
export const DEPLOY = {
  supabaseUrl: '', // fx 'https://abcdefgh.supabase.co'
  supabaseKey: '', // anon / publishable key
  bucket: 'selfies',

  // Vises på gæstesiderne
  brandName: 'minglo',
  brandUrl: 'https://minglo.dk',
};
