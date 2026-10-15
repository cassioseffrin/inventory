import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/pt-br';

dayjs.extend(relativeTime);
dayjs.locale('pt-br');

export const fmtData = (v: string | null | undefined) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');
export const fmtDataHora = (v: string | null | undefined) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—');
export const fmtRelativo = (v: string | null | undefined) => (v ? dayjs(v).fromNow() : 'nunca');
export const diasDesde = (v: string | null | undefined) => (v ? dayjs().diff(dayjs(v), 'day') : null);
