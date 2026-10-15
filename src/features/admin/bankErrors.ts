// El aviso de un error de las funciones del banco para el admin (B11, 2.6 del plan de B11). Los BK
// tienen su frase en bankAdmin.ts y lo demás, como sin red o sin permiso, la del médico.
import { errorCodeOf, type EditorialErrorCode } from '@/data/editorial/editorialRepo';
import { bankAdminText } from '@/i18n/bankAdmin';
import { physicianText } from '@/i18n/physician';

const BK_OF: Partial<Record<EditorialErrorCode, string>> = {
  stale: 'BK002',
  same_author_reviewer: 'BK003',
  blind_labels: 'BK004',
  incomplete: 'BK005',
  report_limit: 'BK006',
  not_assigned: 'BK007',
  flags_unconfirmed: 'BK008',
  sync_busy: 'BK009',
  deck_unauthorized: 'BK010',
  deck_files_missing: 'BK011',
};

export function bankErrorText(error: unknown): string {
  return bankCodeText(errorCodeOf(error));
}

/** La frase de un código ya conocido, como el de una lectura que falló */
export function bankCodeText(code: EditorialErrorCode): string {
  const bk = BK_OF[code];
  return (
    (bk ? bankAdminText.errors[bk] : undefined) ??
    physicianText.errors[code] ??
    physicianText.errors.unknown ??
    ''
  );
}
