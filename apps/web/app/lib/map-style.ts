// The basemap for every map: light paper, or the dark style when the page is in dark mode.
export const MAP_STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
export const isDarkPage = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
export const basemapStyle = () => (isDarkPage() ? MAP_STYLE.dark : MAP_STYLE.light);
