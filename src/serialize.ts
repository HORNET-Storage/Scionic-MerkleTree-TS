import { encode } from 'cbor';
import { Dag } from './types';

export function ToCBOR(dag: Dag): string {
    return encode(dag).toString();
}

export function ToJSON(dag: Dag): string {
    return JSON.stringify(dag);
}