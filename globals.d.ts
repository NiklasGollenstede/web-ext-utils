
/* eslint-disable */

type Await<T> = T extends {
    then(onfulfilled?: (value: infer U) => unknown): unknown;
} ? U : T;

interface RequireT {
	(id: string): any,
	(names: string[], done?: (...modules: any[]) => void, failed?: (error: Error) => void): void;
//	async(id: string): Promise<any>;
	async<idT extends string>(id: idT): Promise<import(idT)>;
	toUrl(id: string): string;
	resolve(id: string): string;
	config(config: object): void;
	cache: Record<string, Module>;
	main: Module;
}
interface Module<ExportT> {
	id: string;
	exports: ExportT | { '': never, };
	ready: Promise<ExportT>;
	require: RequireT;
}
interface DefineT {
	<ExportT>(factory: (modules: Record<string, any>) => Promise<ExportT>|ExportT): Module<ExportT>;
	<ExportT>(modules: string[], factory: (...modules: any[]) => Promise<ExportT>|ExportT): Module<ExportT>;
	<ExportT>(id: string, modules: string[], factory: (...modules: any[]) => Promise<ExportT>|ExportT): Module<ExportT>;
	<ExportT>(id: string, factory: (...modules: any[]) => Promise<ExportT>|ExportT): Module<ExportT>;
	<ExportT>(id: string, exports: ExportT): Module<ExportT>;
	amd: true;
}

declare const require: RequireT;
declare const define: DefineT;

declare const browser: any;

/** @deprecated */ declare const QueryInterface: any;


/// from: https://stackoverflow.com/a/49670389
type DeepReadonly<T> = T extends Function ? T :
T extends (infer R)[] ? DeepReadonlyArray<R> :
T extends object ? DeepReadonlyObject<T> : T;
interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> { }
type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
};
/// end:from
