declare module 'replicad-opencascadejs/src/replicad_single.js' {
	function opencascade(config: { locateFile: () => string }): Promise<unknown>;
	export default opencascade;
}
