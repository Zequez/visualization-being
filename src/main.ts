import "virtual:uno.css";
import { mountSphere } from "./sphere";
const canvas = document.getElementById("canvas")!;

mountSphere(canvas as HTMLCanvasElement);
