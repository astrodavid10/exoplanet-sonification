<template>
  <v-app
    id="app"
    :style="cssVars"
  >
  <div
    id="main-content"
  >
    <WorldWideTelescope
      :wwt-namespace="wwtNamespace"
      @pointerdown="wwtOnPointerDown"
      @pointermove="wwtOnPointerMove"
      @pointerup="wwtOnPointerUp"
    ></WorldWideTelescope>

    <wwt-hud
      v-if="false"
      :wwt-namespace="wwtNamespace"
      :location="{top: '5rem', right: '1rem'}"
      :offset-center="{x: 0, y: 0}"
      :other-variables="{position3D: position3D, position2D: position2D, mode: modeReactive}"
      text-shadow="none"
      font-size="0.8em"
    ></wwt-hud>

    <!--<v-overlay
      :model-value="showSplashScreen"
      absolute
      opacity="0.6"
      :style="cssVars"
      id="splash-overlay"
    >
      <div
        id="splash-screen"
        v-click-outside="closeSplashScreen"
        :style="cssVars"
      >
        <div
          id="close-splash-button"
          @click="closeSplashScreen"
          >&times;
        </div>
        <div id="splash-screen-text">
          <p>
            Explore <span 
            :style="{'color': color14}"
            >Radio Stars</span> in the Milky Way Galaxy!
          </p>
        </div>
      </div>
    </v-overlay>

    <transition>
      <div
        v-if="true"
        class="no-background">
      </div>
      <div
        v-else
        :class="['modal', showSplashScreen ? 'no-background' : '']"
        id="modal-loading"
        v-show="isLoading || userNotReady"
      >
        <div v-if="isLoading" class="container">
          <div  class="spinner"></div>
          <p>Loading …</p>
        </div>
        <div v-else>
          <v-btn
            v-if="!showSplashScreen"
            id="loading-button"
            color="white"
            :disabled="isLoading"
            variant="outlined"
            @click="userNotReady = false"
            @keyup.enter="userNotReady = false"
            elevation="10"
            :size="smallSize ? 'large' : 'x-large'"
            rounded="lg"
            prepend-icon="mdi-check-circle-outline"
          >
            <strong>Start</strong>
          </v-btn>
        </div>  
      </div>
    </transition>-->

    <transition name="fade">
      <div
        class="modal"
        id="modal-loading"
        v-show="isLoading"
      >
        <div class="container">
          <div class="spinner"></div>
          <p>Loading …</p>
        </div>
      </div>
    </transition>

      <!-- This brings up the hamburger menu icon and the menu itself -->
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

      <div class="hamb-icon-container">
        <button class="menu-toggle" @click="toggleMenu">
          <i class="fas fa-sliders-h" style="font-size: 24px;"></i>
        </button>

        <div :class="{ fullscreen: fullscreen }">
          <button class="fullscreen-button" @click="toggleFullscreen">
            <i :class="fullscreen ? 'fas fa-compress fa-lg' : 'fas fa-expand fa-lg'"></i>
          </button>
        </div>

        <ul class="hamb-menu-container" :class="{'show': isMenuOpen }">

        <li class="hamb-menu-items" @click="openIntro">
          <i class="fas fa-regular fa-info-circle"></i>
          Overview
        </li>
        
        <li class="hamb-menu-items" @click="toggleBgSlider">
          <i class="fas fa-adjust"></i> Crossfade (2D)
        </li>

        <li class="hamb-menu-items" @click="toggleSkySurveySelector">
          <i class="fas fa-solid fa-star"></i> Choose Sky Survey (2D)
        </li>
        
        <li class="hamb-menu-items" @click="toggleLink">
          <a 
            href="https://radiostars.org/"
            target="_blank"
            style="text-decoration: none; color: inherit;" 
            onmouseover="this.style.textDecoration='none';" 
            onmouseout="this.style.textDecoration='none';">
            <i class="fas fa-solid fa-rocket"></i> 
            radiostars.org
          </a>
        </li>

        <li class="hamb-menu-items" @click="toggleLink">
          <a 
            href="https://arxiv.org/abs/2404.07418" 
            target="_blank"
            style="text-decoration: none; color: inherit;" 
            onmouseover="this.style.textDecoration='none';" 
            onmouseout="this.style.textDecoration='none';">
            <i class="fas fa-regular fa-newspaper"></i>
            Driessen et al. (2024)
          </a>
        </li>

        <li class="hamb-menu-items" @click="toggleLink">
          <a 
            href="https://www.rocketcenter.com/INTUITIVEPlanetarium/InteractiveAstronomy" 
            target="_blank"
            style="text-decoration: none; color: inherit;" 
            onmouseover="this.style.textDecoration='none';" 
            onmouseout="this.style.textDecoration='none';">
            <i class="fas fa-solid fa-rocket"></i> 
            <i> INTUITIVE</i><sup>®</sup> 
            Planetarium
          </a>
        </li>

        <li class="hamb-menu-items" @click="toggleLink">
          <a
            closeIntro
            href="https://worldwidetelescope.org/"
            style="text-decoration: none; color: inherit;"
            onmouseover="this.style.textDecoration='none';" 
            onmouseout="this.style.textDecoration='none';"
            target="blank">

            <img alt="WWT Logo" src="./assets/logo_wwt.png" width="18" height="18" style="vertical-align: middle;"/>
            WorldWide Telescope
          </a>
        </li>

      </ul>
    </div>  

      <!-- This is the intro text -->
      <div class="intro-container" v-if="showIntro">
        <div class="close-intro" @click="closeIntro">
          <i class="fas fa-times" style="font-size: 20px"></i>
        </div>
        <h1 style="font-size: 18px; font-family: 'Roboto'; margin-bottom: 1em;">{{ introTitle }}</h1>

        <p style="font-size: 14px; margin-bottom: 1em;">
          The Sydney Radio Star Catalogue is a catalogue of radio detected stars and stellar binary systems compiled 
          and maintained by a team at the University of Sydney. It includes: main sequence stars, M and K dwarfs, ultracool 
          dwarfs, magnetically chemically peculiar stars, binaries (e.g. symbiotic binaries and RS CVn) and more. It does 
          not include sources such as novae or X-ray binaries.
        </p>
        <p style="font-size: 14px; margin-bottom: 1em;">
          Included stars have been detected in the radio at least once and are confirmed radio stars. This includes 
          stars that have been detected as circularly polarised radio sources, have radio light curve variability 
          consistent with radio star variability, or are the result of a cross-match with at least 98% reliability. 
          Candidate radio stars are not included. For full details on the construction and inclusions of the 
          catalogue please see 
          <a
          href="https://arxiv.org/abs/2404.07418"
          target="_blank"
          class="links">Driessen et al. (2024)</a>
          and peruse the data at 
          <a
          href="https://radiostars.org/"
          target="_blank"
          class="links">radiostars.org.</a>
        </p>

        <p style="font-size: 14px; margin-bottom: 1em;">
          In this interactive viewer, the Radio Stars are filterable by their observed frequencies. Toggle between 
          2D and 3D views for different perspectives in the sky and Milky Way galaxy, respectively. Hover over a 
          unique star to see its name and distance. Crossfade between optical (visible light) and 
          radio wavelengths in the 2D sky. Zoom in both modes and then zoom some more.
        </p>
        <!-- <p class="text" style="font-size: 14px; margin-bottom: 1em;">{{ introText }}</p> -->
        <!--<p style="font-size: 14px; margin-bottom: 1em;">{{ introInstructions }}</p> -->
        <!--<p style="font-size: 14px; margin-bottom: 1em;">Adapted from
          
          <a class="links" target="_blank" style="margin-right: 0.5em;" href='https://arxiv.org/abs/2307.11132'> 
            “The Third Fermi Large Area Telescope Catalog of Gamma-ray Pulsars,” D. A. Smith et al., 2023.
          </a>
        </p>-->
        <p style="font-size: 14px; margin-bottom: 1em;">
          Interactive created by 
          <a
            href="https://bsky.app/profile/adavidweigel.bsky.social"
            target="_blank"
            class="links" 
            style="margin-right: 0.5em;">A. David Weigel,</a> 
          <a
            href="https://www.linkedin.com/in/erika-s-a37431153/"
            target="_blank"
            class="links"
            style="margin-right: 0.5em;">Érika Silva,</a>
          <a
            href="https://newton.cx/~peter/"
            target="_blank"
            class="links"
            style="margin-right: 0.5em;">Peter K. G. Williams,</a>and
          <a
            href="https://www.jcarifio.com/projects"
            target="_blank"
            class="links"
            style="margin-right: 0.5em;">Jon Carifio</a>
        </p>

        <p style="font-size: 14px; margin-bottom: 1em;">
          Special thanks to Faith Williams for UI suggestions and color theory advice and the 
          <a
            href="https://www.cosmicds.cfa.harvard.edu/"
            target="_blank"
            class="links"
            style="margin-right: 0.5em;">Cosmic Data Stories</a>team.
        </p>
        <p style="font-size: 14px; margin-bottom: 1em;">
          Powered by
          <a	
            href="https://worldwidetelescope.org/home/"
            target="_blank"
            class="links">
             WorldWide Telescope
          </a>
            <a>
              <img alt="WWT Logo" src="./assets/logo_wwt.png" 
              width="20" height="20" style="vertical-align: top; margin-left: 0.25em;"/>
            </a>
        </p>
        <p style="margin-bottom: 0.75em;">
          <a>
              <img alt="IP Logo" src="./assets/ip-ussrc.png" 
              width="178" height="102" style="vertical-align: top; margin-left: 0.5em; transform: translateX(50%);"/>
            </a>
        </p>
      </div>     

    <div
      id="circle-popover"
      v-show="lastClosePt !== null"
      :style="popoverCssVars"
    >
      {{ lastClosePt?.name }}, {{ lastClosePt?.gdist.slice(0,6) }} pc, {{ lastClosePt?.obs }}
    </div>
    
    <button 
      class="catalog-button" 
      @click="openCatalog" 
      v-show="showCatalogButton"
      > {{ showCatalog == true ? 'Collapse  Menu' : 'Filter Radio Stars' }}
    </button>

    <div class="checkboxes-container" v-show="showCatalog">
        <div>
          <!--<v-checkbox 
            v-if="modeReactive == '2D'"
            :color="colorWhite"
            v-model="showConstellations"
            @keyup.enter="showConstellations = !showConstellations"
            label="Constellations"
            class="constellations"
            hide-details
          />-->
          <div class="data-label">
            <p style="color:#E3E3E3; font-size: 1.4rem;">
              Radio Stars
            </p>
            <p>
              Observed Frequency
            </p>
          </div>
          <v-checkbox
            v-for="(freq, index) in Object.keys(layersOn).sort((freq1, freq2) => Number(freq1) - Number(freq2))"
            :key="index"
            :color="colors[index]"
            v-model="layersOn[freq]"
            @keyup.enter="console.log(freq); layersOn[freq] = !layersOn[freq]"
            :label="`${freq.replace('_', '.')} MHz`"
            :class="`type${index}`"
            hide-details
          />
        </div>
        
      <!--<div id="body-logos" v-if= "!smallSize">
        <credit-logos/>
      </div>-->

    </div>
    <div class="center-buttons">
      <button 
        @click="modeReactive = modeReactive == '3D' ? '2D' : '3D'" 
        v-if="true"> 
        {{ modeReactive == '3D' ? '2D Sky View ' : '3D Galaxy View ' }} <i class="fas fa-solid fa-rocket"></i>
      </button>
    </div>

    <!-- This gives the crossfade buttons and slider functionality -->
    <div class="bg-slider-container" v-if="(showBgSlider || showBgButton) && modeReactive == '2D'">      
      <template v-if="currentTool == 'crossfade'"> <!--QQQ need to include "choose-background"-->
          <span
            class="bg-slider-text"
            @click="foregroundOpacity = 0"
            @keyup.enter="foregroundOpacity = 0"
            tabindex="0"
          >Visible light<br></span>
          <input
            class="opacity-range"
            type="range"
            v-model="foregroundOpacity"
          />
          <span
            class="bg-slider-text"
            @click="foregroundOpacity = 100"
            @keyup.enter="foregroundOpacity = 100"
            tabindex="0"
          >Radio waves<br></span>
      </template>
      <template v-if="currentTool == 'choose-background'">
        <v-select
          v-if="modeReactive == '2D'"
          v-model="fgName"
          :items="allSkyImagesets"
          label="Background"
          outlined
          hide-details
          :color="colorWhite"
          class="bg-slider-text"
          />
      </template>
    </div>  
  </div>
  </v-app>
</template>

<script lang="ts">
import { defineComponent, PropType, onMounted, ref } from 'vue';
import { csvFormatRows, csvParse } from "d3-dsv";
import { distance } from "@wwtelescope/astro";
import { Color, Constellations, Folder, Grids, Layer, LayerManager, RenderContext, Settings, SpreadSheetLayer, Texture, WWTControl } from "@wwtelescope/engine"; //Grids, Poly
import { AltTypes, AltUnits, MarkerScales, PlotTypes, RAUnits, Thumbnail } from "@wwtelescope/engine-types"; //ImageSetType, PointScaleTypes
import { GotoRADecZoomParams } from "@wwtelescope/engine-pinia";
import L, { Map } from "leaflet"; //LeafletMouseEvent
import { tween } from "femtotween";
import { MiniDSBase, BackgroundImageset, skyBackgroundImagesets } from "@cosmicds/vue-toolkit";
import { ImageSetLayer, Place } from "@wwtelescope/engine"; //Imageset
import { applyImageSetLayerSetting, applySpreadSheetLayerSetting } from "@wwtelescope/engine-helpers";
import { drawSkyOverlays, initializeConstellationNames, drawSpreadSheetLayer, layerManagerDraw, zoom } from "./wwt-hacks"; //makeAltAzGridText

/*interface MoveOptions {
  instant?: boolean;
  zoomDeg?: number;
  rollRad?: number;
}*/

import {
  MHZ_144_0_CSV,
  MHZ_842_5_CSV,
  MHZ_855_5_CSV,
  MHZ_887_5_CSV,
  MHZ_912_5_CSV,
  MHZ_943_5_CSV,
  MHZ_1013_5_CSV,
  MHZ_1018_5_CSV,
  MHZ_1284_0_CSV,
  MHZ_1364_5_CSV,
  MHZ_1367_5_CSV,
  MHZ_1419_5_CSV,
  MHZ_1543_5_CSV,
  MHZ_1655_5_CSV,
  MHZ_3000_0_CSV
} from "./data";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function asyncSetTimeout<R>(func: () => R , ms: number): Promise<R> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(func()), ms);
  });
}

function asyncWaitForCondition(func: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (func()) {
        clearInterval(interval);
        resolve();
      }
    }, ms);
  });
}

function parseCsvTable(csv: string) {
  return csvParse(csv, (d) => {
    return {
      starname: d.Name!,  // + makes it a number - we don't want that here
      ra: +d.RA!,
      dec: +d.DEC!,
      gdist: +d.Dist!,
      freq: +d.frequency!,
      obs: d.observatory!,
    };
  });
}

//let mode = "3D" as "2D" | "3D" | null; //| "full" 
let mode = "2D" as "3D" | "2D" | null;

const CSVS: Record<string, string> = {
  "144_0": MHZ_144_0_CSV,
  "842_5": MHZ_842_5_CSV,
  "855_5": MHZ_855_5_CSV,
  "887_5": MHZ_887_5_CSV,
  "912_5": MHZ_912_5_CSV,
  "943_5": MHZ_943_5_CSV,
  "1013_5": MHZ_1013_5_CSV,
  "1018_5": MHZ_1018_5_CSV,
  "1284_0": MHZ_1284_0_CSV,
  "1364_5": MHZ_1364_5_CSV,
  "1367_5": MHZ_1367_5_CSV,
  "1419_5": MHZ_1419_5_CSV,
  "1543_5": MHZ_1543_5_CSV,
  "1655_5": MHZ_1655_5_CSV,
  "3000_0": MHZ_3000_0_CSV,
};

const DATA_TABLES = Object.fromEntries(Object.entries(CSVS).map(([freq, csv]) => [freq, parseCsvTable(csv)]));
const DATA_STRINGS = Object.fromEntries(Object.entries(DATA_TABLES).map(([freq, table]) => [freq, formatCsvTable(table)]));


type Table = typeof DATA_TABLES[144];
//type TableRow = typeof MHz_144_0Table[number]; //ZZZ

function formatCsvTable(table: Table): string {
  return csvFormatRows([[
    "Name", "RA", "DEC", "Dist", "frequency" , "observatory" //"Type"
  ]].concat(table.map((d, _i) => {
    return [
      d.starname.toString(),
      d.ra.toString(),
      d.dec.toString(),
      d.gdist.toString(),
      d.freq.toString(),
      d.obs.toString(),
      //d.startype.toString(),
    ];
  }))).replace(/\n/g, '\r\n');
  // By using a regex, we replace all instances.
  // For WWT implementation reasons (left over from 
  // the Windows client?), we need the line endings 
  // to be CRLF
}

/*type LocationRad = { //ZZZ
  longitudeRad: number;
  latitudeRad: number;
};

type EquatorialRad = {
  raRad: number;
  decRad: number;
};

type HorizontalRad = {
  altRad: number;
  azRad: number;
}; */

interface PointData {
  x: number;
  y: number;
  ra: number;
  dec: number;
  name: string;
  gdist: string;
  freq: string; 
  obs: string;
  color: Color;
}

type ToolType = "crossfade" | "choose-background" | null;
type SheetType = "text" | "video" | null;

export default defineComponent({

  extends: MiniDSBase,

  setup() {
    const fullscreen = ref(false);

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }

    onMounted(() => {
      document.addEventListener('fullscreenchange', () => {
        fullscreen.value = !!document.fullscreenElement;
      });
    });

    return {
      fullscreen,
      toggleFullscreen
    };
  },
 
  props: {
    wtml: {
      type: Object,
      required: true
    },
    wwtNamespace: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    thumbnailUrl: {
      type: String,
      required: true
    },
    bgWtml: {
      type: String,
      required: true
    },
    bgName: {
      type: String,
      required: true
    },
    /*fgName: {
      type: String,
      required: true
    },*/

    introText: {
      required: true
    },
    introTitle: {
      required: true
    },
    initialCameraParams: {
      type: Object as PropType<Omit<GotoRADecZoomParams, 'instant'>>,
      default() {
        return {
          raRad: 280 * D2R, //271.87846654
          decRad: -50 * D2R, //-48.42
          zoomDeg: 289555092.0 * 6
        };
      }
    }    
  },
  data() {
    const initial2DPosition = {
      raRad: 4.64693913, //this.wwtRARad, 6
      decRad: -0.4977679, //this.wwtDecRad, 1
      zoomDeg: 360
    } as Omit<GotoRADecZoomParams,'instant'>;
    
    const idealPosition = {
      raRad: 0.6984155220905679, 
      decRad: 0.7132099678793872, 
      rollRad: 0.183,
      zoomDeg: 360,
      instant: true
    }  as GotoRADecZoomParams;

    const frequencies = Object.keys(DATA_STRINGS);

    return {
      showIntro: true,
      isMenuOpen: false,
      showBgButton: false,
      showBgSlider: true,
      skySurveySelectedCount: 0,
      hiddenIntro: false,
      showCatalog: true,
      showCatalogButton: true,
      userNotReady: true,

      showSplashScreen: true,
      imagesetLayers: {} as Record<string, ImageSetLayer>,
      layersLoaded: false,
      positionSet: false,
      imagesetFolder: null as Folder | null,
      backgroundImagesets: [] as BackgroundImageset[],
      cfOpacity: 0,

      playing: false,
      playCount: 0,

      showAltAzGrid: false,
      showConstellations: false,

      currentAllLayer: null as SpreadSheetLayer | null,
      
      /*color0: "#2767a4", //"#4c8bff",
      color1: "#4e91af", //"#00b27a",
      color2: "#75bab9", //"#FF8A2E",
      color3: "#19535f", //"#F7ED5D",
      color4: "#497e73", //"#ff4da0",
      color5: "#79a887", //"#FF533D",
      color6: "#964983",
      color7: "#b46491",
      color8: "#ca96ab",
      color9: "#337abf",  
      color10: "#6fa6c0",  
      color11: "#8cd1d3",  
      color12: "#133f47",  
      color13: "#366758",  
      color14: "#638b6f",*/

      //QQQ fix order here
      colors: [
        "#2767a4",  
        "#4e91af",  
        "#75bab9",  
        "#19535f", 
        "#497e73", 

        "#79a887",
        "#964983",
        "#b46491",  
        "#ca96ab", 
        "#7563ab",
        
        "#b495c9",
        "#bb5d66",
        "#e48484", 
        "#8aa239", 
        "#b1c948", 
      ],
      
      colorD: "#070021cc", //"#45aecb",
      colorWhite: "#ffffff",
      todayColor: "#D6B004",

      layers: frequencies.reduce(
        (obj: Record<string, SpreadSheetLayer | null>, value: string) => {
          obj[value] = null;
          return obj;
        }, {}) as { [freq: string]: SpreadSheetLayer | null },

      layersOn: frequencies.reduce(
        (obj: Record<string, boolean>, value: string) => {
          obj[value] = true;
          return obj;
        }, {}),
      
      modeReactive: mode as "2D" | "3D" | null, //| "full"
      resizeObserver: null as ResizeObserver | null,
      //background2DImageset: "Deep Star Maps 2020",
      fgName: "PLANCK R2 HFI color composition 353-545-857 GHz",
      position3D: this.initialCameraParams as Omit<GotoRADecZoomParams,'instant'>,
      position2D: initial2DPosition as Omit<GotoRADecZoomParams,'instant'>,
      initial2DPosition,
      
      
      allSkyImagesets: [
        'Deep Star Maps 2020', 
        'Mellinger color optical survey',  // HIPS
        'Eckhard All Sky',
        "Gaia DR2",
        'Digitized Sky Survey (Color)',
        'unWISE color, from W2 and W1 bands', // HIPS
        'WISE All Sky (Infrared)',
        'Planck Thermal Dust',
        'Hydrogen Alpha Full Sky Map',
        "PLANCK R2 HFI color composition 353-545-857 GHz", // HIPS
      ],
      previousMode: mode as "2D" | "3D" | null,
      idealPosition: idealPosition, //fullwavePosition


      minZoom: 3000000,//160763995.5927744,
      maxZoom: 22328103718.39476,


      incomingItemSelect: null as Thumbnail | null,
      
      sheet: null as SheetType,
      showMapTooltip: false,
      showTextTooltip: false,
      showVideoTooltip: false,
      showPlayPauseTooltip: false,
      showLocationSelector: false,
      showControls: false,
      currentTool: "crossfade" as ToolType, //"choose-background" as ToolType,
      tab: 0,

      circle: null as L.Circle | null,
      map: null as Map | null,

      selectionProximity: 4,
      pointerMoveThreshold: 6,
      isPointerMoving: false,
      pointerStartPosition: null as { x: number; y: number } | null,
      lastClosePt: null as PointData | null
    };
  },

  mounted() {

    this.waitForReady().then(async () => {
      this.backgroundImagesets = [...skyBackgroundImagesets];
      
      // initialize the view to black so that we don't flicker DSS
      this.applySetting(["galacticMode", true]);
      this.loadHipsWTML().then(() => this.positionSet = true);

      this.applySetting(["showConstellationBoundries", false]);  // Note that the typo here is intentional
      this.applySetting(["solarSystemStars", false]);
      this.applySetting(["actualPlanetScale", true]);
      this.applySetting(["showConstellationFigures", false]);
      this.applySetting(["showCrosshairs", false]);
      this.applySetting(["solarSystemCosmos", false]);
      // this.applySetting(["solarSystemPlanets", false]);
      this.setClockSync(false);

      // Unlike the other things we're hacking here,
      // we aren't overwriting a method on a singleton instance (WWTControl)
      // or a static method (Constellations, Grids)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      SpreadSheetLayer.prototype.draw = drawSpreadSheetLayer;

      this.setClockSync(false);

      this.imagesetFolder = await this.loadImageCollection({
        url: this.wtml.gammaraypulsar,
        loadChildFolders: false
      });
      const children = this.imagesetFolder.get_children() ?? [];
      
      const layerPromises: Promise<Layer>[] = [];
      children.forEach((item) => {
        if (!(item instanceof Place)) { return; }
        const imageset = item.get_backgroundImageset() ?? item.get_studyImageset();
        if (imageset == null) { return; }
        const name = imageset.get_name();
        layerPromises.push(this.addImageSetLayer({
          url: imageset.get_url(),
          mode: "autodetect",
          name: name,
          goto: false
        }).then((layer) => {
          this.imagesetLayers[name] = layer;
          applyImageSetLayerSetting(layer, ["opacity", 0]);
          return layer;
        }));
      });
      
      this.loadImageCollection({
        url: this.bgWtml,
        loadChildFolders: true,
      }).then((_folder) => {
        this.curForegroundImagesetName = this.fgName;
        this.foregroundOpacity = 0;
        this.backgroundImagesets.unshift(
          new BackgroundImageset("Fermi LAT 8-Year (Gamma Ray)", "Fermi LAT 8-year (gamma)")
        );// do for each

        tween(0, 70, (value) => { this.foregroundOpacity = value; }, {
          time: 7500,
          //ease: (t: number) => t * (2 * (1 - t) * 1.75 + t * 0.5),
          //done: () => { this.foregroundOpacity = 50; }
        });
      });
      

      this.loadImageCollection({
        url: this.bgWtml,
        loadChildFolders: true,
      });
      
      this.backgroundImagesets = [...skyBackgroundImagesets];

      Object.entries(DATA_STRINGS).forEach(([freq, string]) => {
        this.createTableLayer({
          name: `${Number(freq).toFixed(1)} MHz`,
          referenceFrame: "Sky",
          dataCsv: string,
        }).then((layer) => {
          layer.set_lngColumn(1);
          layer.set_latColumn(2);
          layer.set_altColumn(3);
          layer.set_altUnit(AltUnits.parsecs);
          layer.set_altType(AltTypes.distance);
          layer.set_markerScale(MarkerScales.screen);
          layer.set_showFarSide(true);
          this.applyTableLayerSettings({
            id: layer.id.toString(),
            settings: [
              ["scaleFactor", 45],
              ["plotType", PlotTypes.circle],
              ["color", Color.fromHex(this.colors[0])],
              //["sizeColumn", 4],
              //["pointScaleType", PointScaleTypes.log],
              ["opacity", 1.0]
            ]
          });
          this.layers[freq] = layer;
        });
      });
      
      this.showControls = !this.mobile;
      
      /*this.loadImageCollection({
        url: this.bgWtml,
        loadChildFolders: true,
      }).then(() => { //ZZZ folder 
        this.curForegroundImagesetName = this.fgName;
        this.backgroundImagesets.unshift(
          new BackgroundImageset("Fermi LAT 8-Year (Gamma Ray)", "Fermi LAT 8-year (gamma)")
        );
      });*/
      
      Promise.all(layerPromises).then(() => {
        this.layersLoaded = true;
        
        // Set all of the imageset layers to be above the spreadsheet layers
        //this.resetImagesetLayerOrder();

        const splashScreenListener = (_event: KeyboardEvent) => {
          this.showSplashScreen = false;
          window.removeEventListener('keyup', splashScreenListener);
        };
        window.addEventListener('keyup', splashScreenListener);

        window.addEventListener('keyup', (event: KeyboardEvent) => {
          if (["Esc", "Escape"].includes(event.key) && this.showVideoSheet) {
            this.showVideoSheet = false;
          }
        });
      });
      
      this.loadImageCollection({
        url: this.bgWtml,
        loadChildFolders: true,
      }).then((_folder) => {
        this.curBackgroundImagesetName = this.bgName;
        this.backgroundImagesets.unshift(
          new BackgroundImageset("NASA Deep Star Maps (Optical)", "Deep Star Maps 2020")
        );
      });

      Object.keys(this.layersOn).forEach(freq => {
        this.$watch(`layersOn.${freq}`, (on: boolean) => {
          const layer = this.layers[freq];
          if (layer !== null) {
            applySpreadSheetLayerSetting(layer, ["opacity", on ? 1.0 : 0.0]);
          }
        });
      });


      this.wwtSettings.set_localHorizonMode(false);//QQQ
      this.wwtSettings.set_showAltAzGrid(this.showAltAzGrid);
      this.wwtSettings.set_showAltAzGridText(this.showAltAzGrid);
      this.wwtSettings.set_showConstellationLabels(this.showConstellations);
      this.wwtSettings.set_showConstellationFigures(this.showConstellations);

      // This is kinda horrible, but it works!

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.wwtControl._drawSkyOverlays = drawSkyOverlays;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Constellations.initializeConstellationNames = initializeConstellationNames;
      //Grids._makeAltAzGridText = makeAltAzGridText;

      Grids._milkyWayImage = Texture.fromUrl("https://data1.wwtassets.org/packages/2025/01_gaia_milky_way/Gaia-HighContrast-MilkyWay-sm.jpg");

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      LayerManager._draw = layerManagerDraw;

      // wwtZoomDeg is still 0 if we run this here
      // and it was the same in nextTick
      // so give just a bit of a delay
      /*setTimeout(() => {
        this.positionSet = true;
        this.gotoRADecZoom({
          raRad: 4.64693913, //this.wwtRARad,
          decRad: -0.4977679, //this.wwtDecRad,
          zoomDeg: 360,
          instant: true, // false this competes with the tween crossfade from optical to radio, needs troubleshooting
        });
      }, 100);*/

    });
    /*this.resizeObserver = new ResizeObserver((_entries) => {
      this.shinkWWT();
    });*/
    
    // Pin the min and max zoom in 3D mode
    WWTControl.singleton.setSolarSystemMinZoom(this.minZoom);
    WWTControl.singleton.setSolarSystemMaxZoom(this.maxZoom);

    // Patch the zoom function to account for min zoom as well
    // See upstream fix at https://github.com/WorldWideTelescope/wwt-webgl-engine/pull/292
    WWTControl.singleton.zoom = zoom.bind(WWTControl.singleton);
    
  },

  computed: {
    
    crossfadeOpacity: {
      get(): number {
        return this.cfOpacity;
      },
      set(o: number) {
        // if (this.layers.gammafermi) {
        //   applyImageSetLayerSetting(this.layers.gammafermi, ["opacity", 0.01 * o]);
        // }
        this.cfOpacity = o;
      }
    },

    
    isLoading(): boolean {
      return !this.ready;
    },
    ready(): boolean {
      return this.layersLoaded && this.positionSet;
    },
    smallSize(): boolean {
      return this.$vuetify.display.smAndDown;
    },
    mobile(): boolean {
      return this.smallSize && this.touchscreen;
    },
    cssVars() {
      const css: Record<string, string> = {
        '--color-default': this.colorD,
        '--color-default2': this.colorWhite,
        '--app-content-height': this.showTextSheet ? '66%' : '100%',
      };

      for (const [index, color] of Object.entries(this.colors)) {
        css[`--color${index}`] = color;
      }
      return css;
    },
    popoverCssVars() {
      const x = this.lastClosePt?.x ?? 0;
      const y = this.lastClosePt?.y ?? 0;

      // Note that the canvas takes up the full width
      const leftPct = 100 * x / window.innerWidth;
      const topPct = 100 * (y - 50) / window.innerHeight;
      return {
        '--current-color': this.lastClosePt?.color.toString() ?? "white",
        '--current-left': `${leftPct}%`,
        '--current-top': `${topPct}%`
      };
    },
    wwtControl(): WWTControl {
      return WWTControl.singleton;
    },
    wwtRenderContext(): RenderContext {
      return this.wwtControl.renderContext;
    },
    wwtSettings(): Settings {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return Settings.get_active();
    },
  
    showTextSheet: {
      get(): boolean {
        return this.sheet === 'text';
      },
      set(_value: boolean) {
        this.selectSheet('text');
        this.showTextTooltip = false;
      }
    },
    showVideoSheet: {
      get(): boolean {
        return this.sheet === "video";
      },
      set(value: boolean) {
        this.selectSheet('video');
        if (!value) {
          const video = document.querySelector("#info-video") as HTMLVideoElement;
          video.pause();
        }
        this.showVideoTooltip = false;
      }
    },
    
    curBackgroundImagesetName: {
      get(): string {
        if (this.wwtBackgroundImageset == null) return "";
        return this.wwtBackgroundImageset.get_name();
      },
      set(name: string) {
        this.setBackgroundImageByName(name);
      }
    },
    
    curForegroundImagesetName: {
      get(): string {
        if (this.wwtForegroundImageset == null) return "";
        return this.wwtForegroundImageset.get_name();
      },
      set(name: string) {
        this.setForegroundImageByName(name);
      }
    },
    
    foregroundOpacity: {
      get(): number {
        return this.wwtForegroundOpacity;
      },
      set(o: number) {
        this.setForegroundOpacity(o); 
      }
    },
    wwtPosition(): Omit<GotoRADecZoomParams,'instant'> {
      return {
        raRad: this.wwtRARad,
        decRad: this.wwtDecRad,
        rollRad: this.wwtRollRad,
        zoomDeg: this.wwtZoomDeg,
      };
    }
  },

  methods: {

    // JC: When the "allow imagesets above spreadsheets" functionality
    // gets added into the engine,
    // remember to add something like this along with it
    setSpreadSheetLayerOrder(id: string, order: number) {
      const layer = LayerManager.get_layerList()[id];
      const layers = LayerManager.get_allMaps()[layer.get_referenceFrame()].layers;
      if (order >= 0) {
        const currentIndex = layers.indexOf(layer);
        if (currentIndex > -1) {
          layers.splice(currentIndex, 1);
        }
        LayerManager.get_allMaps()[layer.get_referenceFrame()].layers.splice(order, 0, layer);
      }
    },


    closeSplashScreen() {
      this.showSplashScreen = false;
      // Promise based wait for isLoading to be false
      asyncWaitForCondition(() => (!this.isLoading && !this.userNotReady), 100).then(() => {
        setTimeout(() => {
          //this.playing = true;
        }, 500);
      });
    },
    async loadHipsWTML () {
      return this.loadImageCollection({
        url: "http://data1.wwtassets.org/packages/2025/01_radiostars/radiostars-bgsurveys-v1.wtml",
        loadChildFolders: true,
      });
    },

    set2DMode() {
      this.setBackgroundImageByName(this.bgName);
      this.setForegroundImageByName(this.fgName); //AAA add function to remeber selected foreground imageset
      this.applySetting(["showSolarSystem", false]);

      Object.values(this.layers).forEach(layer => {
        layer?.set_scaleFactor(35);
        layer?.set_plotType(PlotTypes.circle);
        // layer?.set_opacity(1);
      });

      return asyncSetTimeout(() => {
        
        this.gotoRADecZoom({
          ...this.position2D,
          instant: true
        }).catch((err) => {
          console.log(err);
        
        }); 
      }, 10);

    },
    
    set3DMode() { 
      this.setBackgroundImageByName("Solar System");
      this.setForegroundImageByName("Solar System");

      Object.values(this.layers).forEach(layer => {
        layer?.set_scaleFactor(25);
        layer?.set_plotType(PlotTypes.gaussian);
        // layer?.set_opacity(1);
      });

      return this.gotoRADecZoom({
        ...this.position3D,
        instant: true,
      }).catch((err) => {
        console.log(err);
      });

    },

    selectSheet(name: SheetType) {
      if (this.sheet == name) {
        this.sheet = null;
      } else {
        this.sheet = name;
      }
    },

    getImageSetLayerIndex(layer: ImageSetLayer): number {
      // find layer in this.wwtActiveLayers
      // this.wwtActiveLayers is a dictionary of {0:id1, 1:id2, 2:id3, ...}
      // get the key item with the value of layer.id
      for (const [key, value] of Object.entries(this.wwtActiveLayers)) {
        if (value === layer.id.toString()) {
          return Number(key);
        }
      }
      return -1;
    },

    closestInView(
      point: { x: number, y: number },
      threshold?: number
    ): PointData | null {

      let minDist = Infinity;
      let closestPt: PointData | null = null;

      const rowSeparator = "\r\n";
      const colSeparator = "\t";

      const raDecDeg = this.findRADecForScreenPoint(point);
      const target = { ra: D2R * raDecDeg.ra, dec: D2R * raDecDeg.dec };

      for (const layer of Object.values(this.layers)) {
        if (layer == null) {
          continue;
        }

        const inView = layer.getTableDataInView();
        const rows = inView.split(rowSeparator);
        const header = rows.shift();
        if (!header) {
          continue;
        }

        const lngCol = layer.get_lngColumn();
        const latCol = layer.get_latColumn();
        const nameCol = 0;  // All of the data sets have the name in the first column
        const distCol = 3; 
        const freqCol = 4;
        const obsCol = 5;

        for (const row of rows) {
          const values = row.split(colSeparator);
          const ra = D2R * Number(values[lngCol]);
          const dec = D2R * Number(values[latCol]);
          const pt = { ra: ra, dec: dec };
          const dist = distance(target.ra, target.dec, pt.ra, pt.dec);
          if (dist < minDist) {
            closestPt = {
              ...point,
              ra: ra,
              dec: dec,
              name: values[nameCol],
              gdist: values[distCol],
              freq: values[freqCol],
              obs: values[obsCol],
              color: layer.get_color()
            };
            minDist = dist;
          }
        }
      }

      if (closestPt !== null) {
        const closestRADecDeg = { ra: closestPt.ra * R2D, dec: closestPt.dec * R2D };
        const closestScreenPoint = this.findScreenPointForRADec(closestRADecDeg);
        const pixelDist = Math.sqrt((point.x - closestScreenPoint.x) ** 2 + (point.y - closestScreenPoint.y) ** 2);
        if (!threshold || pixelDist < threshold) {
          return closestPt;
        }
      }
      return null;

    },

    wwtOnPointerMove(event: PointerEvent) {
      if (!this.isPointerMoving && this.pointerStartPosition !== null) {
        const dist = Math.sqrt((event.pageX - this.pointerStartPosition.x) ** 2 + (event.pageY - this.pointerStartPosition.y) ** 2);
        if (dist > this.pointerMoveThreshold) {
          this.isPointerMoving = true;
        }
      }
      this.updateLastClosePoint(event);
    },

    wwtOnPointerDown(event: PointerEvent) {
      this.isPointerMoving = false;
      this.pointerStartPosition = { x: event.pageX, y: event.pageY };
    },

    wwtOnPointerUp(event: PointerEvent) {
      if (!this.isPointerMoving) {
        this.updateLastClosePoint(event);
      }

      this.pointerStartPosition = null;
      this.isPointerMoving = false;
    },

    updateLastClosePoint(event: PointerEvent): void {
      const pt = { x: event.offsetX, y: event.offsetY };
      const closestPt = this.closestInView(pt, this.selectionProximity);
      if (closestPt == null && this.lastClosePt == null) {
        return;
      }
      const needsUpdate =
        closestPt == null ||
        this.lastClosePt == null ||
        this.lastClosePt.ra != closestPt.ra ||
        this.lastClosePt.dec != closestPt.dec;
      if (needsUpdate) {
        this.lastClosePt = closestPt;
      }
    },

    wwtSmallestFov(): number {
      // ignore the possibility of rotation
      const w = this.wwtRenderContext.width;
      const h = this.wwtRenderContext.height;
      const fovH = this.wwtRenderContext.get_fovAngle() * D2R;
      const fovW = fovH * w / h;
      return Math.min(fovW, fovH);
    },
    
    /*circleForLocation(latDeg: number, lonDeg: number): L.Circle<any> {
      return L.circle([latDeg, lonDeg], {
        color: "#FF0000",
        fillColor: "#FF0033",
        fillOpacity: 0.5,
        radius: 200
      });
    },*/

    /* Toggles the hamburger menu when the hamburger icon is clicked */
    toggleMenu() {
      this.isMenuOpen = !this.isMenuOpen;
      this.showCatalog = false; //!this.showCatalog;
      this.showCatalogButton = !this.showCatalogButton;
    },    

    openCatalog() {
      this.showCatalog = !this.showCatalog;
    },

    openCatalogButton() {
      this.showCatalogButton = !this.showCatalogButton;
    },

    /* This is for the "Toggle description" in the hamburger menu. It opens the intro container */
    openIntro() {
      this.showIntro = !this.showIntro;
      this.showBgButton = false;
      this.showCatalog = true;
      this.showCatalogButton = true;
      this.isMenuOpen = !this.isMenuOpen;
      this.currentTool == 'crossfade';
    },
    
    toggleLink() {
      this.isMenuOpen = !this.isMenuOpen;
      this.showCatalog = true;
      this.showCatalogButton = true;
    },

    toggleBgSlider() {
      this.showBgSlider = !this.showBgSlider;
      this.showIntro = false;
      this.showBgButton = false;
      this.isMenuOpen = false;
      this.showCatalog = true;
      this.showCatalogButton = true;
      this.currentTool = 'crossfade';
    },    

    toggleSkySurveySelector() {
      this.showBgButton = !this.showBgButton;
      this.showIntro = false;
      this.showBgSlider = false;
      this.isMenuOpen = false;
      this.showCatalog = true;
      this.showCatalogButton = true;
      this.currentTool = 'choose-background';
      this.skySurveySelectedCount = this.skySurveySelectedCount + 1;
    },

    /* This is for the close button of the intro box */
    closeIntro() {
      this.showIntro = false;
    },
    

    // WWT does have all of this functionality built in
    // but it doesn't seem to be exposed
    // We should do that, but for now we just copy the web engine code
    // https://github.com/Carifio24/wwt-webgl-engine/blob/master/engine/wwtlib/Coordinates.cs
    altAzToHADec(altRad: number, azRad: number, latRad: number): { ra: number; dec: number; } {
      azRad = Math.PI - azRad;
      if (azRad < 0) {
        azRad += 2 * Math.PI;
      }
      let ra = Math.atan2(Math.sin(azRad), Math.cos(azRad) * Math.sin(latRad) + Math.tan(altRad) * Math.cos(latRad));
      if (ra < 0) {
        ra += 2 * Math.PI;
      }
      const dec = Math.asin(Math.sin(latRad) * Math.sin(altRad) - Math.cos(latRad) * Math.cos(altRad) * Math.cos(azRad));
      return { ra, dec };
    },

    setLayerOpacityForImageSet(name: string, opacity: number, setting_opacity_from_ui=false) {
      const layer = this.imagesetLayers[name];
      if (layer != null) {
        // update the image opacity in the WWT control
        applyImageSetLayerSetting(layer, ['opacity', opacity]);

        // update the value for the slider only if we are not setting the opacity from the UI
        if (!setting_opacity_from_ui) {
          const selector = `#items div.item[title='${name}'] input.opacity-range[type='range']`;
          const el = (document.querySelector(selector) as HTMLInputElement);
          if (el != null) {
            el.value = `${opacity * 100}`;
          }
        }

        const toggleSelector = `#items input[type='checkbox'][title='${name}']`;
        const el2 = (document.querySelector(toggleSelector) as HTMLInputElement);
        // truth table: opacity == 0 and el.checked == false => do nothing
        // truth table: opacity == 0 and el.checked == true => set el.checked = false
        // truth table: opacity > 0 and el.checked == false => set el.checked = true
        // truth table: opacity > 0 and el.checked == true => do nothing
        if (el2 != null) {
          if (opacity == 0 && el2.checked) {
            el2.checked = false;
          } else if (opacity > 0 && !el2.checked) {
            el2.checked = true;
          }
        }
        
      }
    },
    /*positionReset() {
      // since we aren't changing modes, 
      // we don't need to use set2DMode or set3DMode
      // also those are locked to only work if the mode is chaning
      // so we let's do this manually. 
      
      // only reset the current mode
      let pos = null as unknown as Omit<GotoRADecZoomParams, "instant">;
      if (this.modeReactive == "2D") {
        this.position2D = this.initial2DPosition;
        pos = this.position2D;
        
      } else if (this.modeReactive == "3D") {
        this.position3D = this.initialCameraParams;
        pos = this.position3D;
      } else if (this.modeReactive == 'full') {
        pos = this.idealPosition;
      }
      
      // we will move nicely. 
      this.gotoRADecZoom({
        ...pos,
        instant: false
      }).catch((err) => {
        console.log(err);
      });
      
      
    },
    
    shinkWWT(aspect: number = null as unknown as number) {
      // default aspect = 5.7
      if (aspect == null) {
        aspect = 5.7;
      }
      console.log('shinkWWT');
      
      const mainContent = document.querySelector(".wwtelescope-component") as HTMLElement;
      const width = mainContent.clientWidth;
      const height = width / aspect;
      mainContent.style.height = `${height}px`;
    },
    
    growWWT() {
      const mainContent = document.querySelector(".wwtelescope-component") as HTMLElement;
      mainContent.style.height = `100%`;
      this.resizeObserver?.unobserve(document.body as HTMLElement);
    },
*/
    basicLayerSetup(layer: SpreadSheetLayer) { //, timeSeries=false
      layer.set_lngColumn(1);
      layer.set_latColumn(2);
      layer.set_altColumn(3);
      layer.set_raUnits(RAUnits.degrees);
      layer.set_altUnit(AltUnits.parsecs);
      layer.set_altType(AltTypes.distance);
      layer.set_showFarSide(true);
      layer.set_markerScale(MarkerScales.screen);
      layer.set_plotType(PlotTypes.gaussian);
    
      /*if (timeSeries) {
        layer.set_startDateColumn(4);
        layer.set_endDateColumn(5);
        layer.set_timeSeries(true);
        //layer.set_decay(this.defaultClusterDecay);
      }*/
    },

    /*async toggleIdealViewingMode() {
      // to view in the full wave you need to adjust the height
      // of the window/canvas to have an W:H ration of 5.7
      let old3D = null as unknown as Omit<GotoRADecZoomParams,'instant'>;
      if (this.modeReactive == 'full') {
        this.modeReactive = this.previousMode;
        this.positionReset();
        return;
      } else if (this.modeReactive == '3D') {
        old3D = this.wwtPosition;
      }
      
      return this.set2DMode().then(() => {
        this.previousMode = this.modeReactive;
        this.modeReactive = "full";
        //phase=0;
        
        this.shinkWWT();
        this.resizeObserver?.observe(document.body);
        
        return this.gotoRADecZoom({
          ...this.idealPosition, 
          instant: false}).catch((err) => {
          console.log(err);
        }).then(() => {
          if (old3D) {this.position3D = old3D;}
        });
      });
      
    }, */
		
  },

  watch: {
    showAltAzGrid(show: boolean) {
      this.wwtSettings.set_showAltAzGrid(show);
      this.wwtSettings.set_showAltAzGridText(show);
    },
    showConstellations(show: boolean) {
      this.wwtSettings.set_showConstellationLabels(show);
      this.wwtSettings.set_showConstellationFigures(show);
    },

    fgName(name: string) {
      
      if (this.modeReactive == "2D") {
        this.setForegroundImageByName(name);
        return;
      }
      
    },
    
    modeReactive(newVal, oldVal) {
      mode = newVal;
      if (oldVal == newVal) {
        if (newVal == "2D") {
          this.set2DMode();
        }
        if (newVal == "3D") {
          this.set3DMode();
        }
        /*if (newVal == "full") {
          this.toggleIdealViewingMode();
        }*/
      } else {
      
        if (oldVal == "2D") {
          this.position2D = this.wwtPosition;
        } else if (oldVal == "3D") {
          this.position3D = this.wwtPosition;
        } /*else if (oldVal == "full") {
          this.resizeObserver?.disconnect();
          this.growWWT();
          //this.toggleUI(); //ZZZ
        }*/
      }
      
      
      
      if (newVal == "2D") {
        this.set2DMode();
      } else if (newVal == "3D") {
        this.set3DMode();
      } else {
        // don't do anything if mode is null
        return;
      }
      
    } 
  }
});

</script>

<style lang="less" scoped>

.no-background {
  background-image: none!important;
}

.intro-container {
  width: 90%;
  max-width: 30em;
  height: 120px;
  background: var(--color-default); // rgba(12, 11, 56, 0.808);
  color: rgb(227, 227, 227);
  border: solid 1px #1671e07c;
  padding-left: 1.5em; 
  padding-right: 1.5em; 
  padding-top: 3px;
  border-radius: 10px; 
  position: absolute;
  bottom: 4em;
  left: 50%;
  transform: translateX(-50%);
  display: inline-block;
  overflow: auto; /* Allow vertical scrolling */
  font-family: Roboto;
  transition: border-color 0.3s ease;
}

.intro-container:hover {
  box-shadow: 0 0 3px 2px #1671e07c; 
}

.intro-container::-webkit-scrollbar {
  width: 0.5px;
  background-color: transparent;
}

.intro-container::-webkit-scrollbar-track {
  background-color: transparent;
}

.intro-container::-webkit-scrollbar-thumb {
  background-color: #ffffff00;
  border-radius: 0.5px;
}

.close-intro {
  position: absolute;
  top: 5px;
  right: 8px;
  cursor: pointer;
  padding: 2px;
  background-color: #00000000;
  // vertical-align: middle;
}

/* Where the hamburger menu icon is located */
.hamb-icon-container {
  position: absolute;
  right: 0;
  padding: 10px;
  top: 2.8rem;
  z-index: 11;
}

/* Hamburger menu */
.hamb-menu-container {
  display: none;
  padding: 20%;
  position: absolute;
  border-radius: 10px;
  color: rgb(227, 227, 227);
  top: 20%;
  right: 90%;
  background: var(--color-default); // rgba(12, 11, 56, 0.808);
  border: solid 1px #1671e07c;
  width: 13.5rem;
  list-style-type: none; /* This removes the bullet points */
  font-family: Roboto;
  z-index: 11;
}

/* Not sure what this is for, but it is needed for the menu to work */
.hamb-menu-container.show {
  display: block;
}

.hamb-menu-items:hover {
  background-color: #1671e000; /*#1671e0c0*/
  cursor: pointer;
  padding-left: 15px; /* Remove if you don't want the moving as hovering effect */
}

.hamb-menu-container:hover {
box-shadow: 0 0 3px 2px #1671e07c; 
} 

.fullscreen {
  width: 100vw;
  height: 100vh;
  position: absolute;
}

.fullscreen-button {
  position: absolute;
  top: 80%;
  right: 30%;
  z-index: 11;
}

.bg-slider-container {
  display: flex;
  flex-direction: row;
  gap: 5px;
  width: 90%;
  max-width: 60em;
  padding-left: 1.5em; 
  padding-right: 1.5em; 
  padding-top: 3px;
  border-radius: 10px; 
  position: absolute;
  bottom: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
}

.bg-slider-text {
  color: rgb(227, 227, 227);
  background: var(--color-default); //rgba(12, 11, 56, 0.808);
  border: solid 1px #1671e07c;
  padding: 5px 5px;
  pointer-events: auto;
  font-size: 0.8em;
  text-align: center;
  border-radius: 10px;

  &:hover {
    box-shadow: 0 0 4px 3px #1671e07c;
    transition: all 200ms ease-out;
    cursor: pointer;
  }
}

.opacity-range {
  pointer-events: auto;
  width: 95%;
  align-items: center;
}

.catalog-button {
  background: var(--color-default); // rgba(12, 11, 56, 0.808);
  border: solid 1px #1671e07c;
  text-align: center;
  color: rgb(227, 227, 227);
  border-radius: 10px; //10px 10px 0 0;
  left: 0.5rem;
  height: 2rem;
  position: absolute;
  top: 0.8rem;
  width: 10.2rem;
  cursor: pointer;
  z-index: 11;
}

.catalog-button:hover {
box-shadow: 0 0 3px 2px #1671e07c; 
} 

.center-buttons { //ok it isn't center, who are we kidding?
  //width: 90%;
  //max-width: 30em;
  //height: 120px;
  background: var(--color-default); // rgba(12, 11, 56, 0.808);
  color: rgb(227, 227, 227);
  border: solid 1px #1671e07c;
  padding-left: 1em; 
  padding-right: 1em; 
  padding-top: 4px;
  border-radius: 10px; 
  position: absolute;
  top: 0.8rem;
  height: 2rem;
  right: 0.5rem;
  //left: 50%;
  z-index: 11;
  //transform: translateX(-50%);
  display: inline-block;
  overflow: auto; /* Allow vertical scrolling */
  font-family: Roboto;
  transition: border-color 0.3s ease;
}

.center-buttons:hover {
box-shadow: 0 0 3px 2px #1671e07c; 
} 

.checkboxes-container {
  max-height: calc(65vh - 9rem);
  left: 0.75rem;
  overflow-y: scroll;
  position: absolute;
  top: 2.8rem;
  width: 9.7rem;
  font-size: 0.8rem;
  text-align: left;
  border-radius: 0 0 10px 10px;
  background: var(--color-default); // rgba(12, 11, 56, 0.808);
  border: solid 1px #1671e07c;
  padding: 10px;
}

.checkboxes-container::-webkit-scrollbar {
  background-color: transparent;
  width: 0px;
}

.checkboxes-container::-moz-scrollbar {
  overflow: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.checkboxes-container::-webkit-scrollbar-track {
  background-color: transparent;
}

.checkboxes-container::-webkit-scrollbar-thumb {
  background-color: #ffffff76;
  border-radius: 4px;
}



.links {
  color: rgb(227, 227, 227);
}

@font-face {
  font-family: 'Roboto';
  src: url('./assets/Roboto.ttf')
}

#circle-popover {
  background-color: var(--color-default); //rgba(12, 11, 56, 0.808);
  color: var(--current-color);
  border: solid 1px var(--current-color);
  border-radius: 10px;
  position: relative;
  left: var(--current-left);
  top: var(--current-top);
  width: fit-content;
  padding: 5px;
}

.data-label {
	color: var(--color-default2);
  font-size: 0.8rem;
}

.constellations :deep(label) {
    color: var(--color-default2);
    font-size: 0.8em;
}

.type0 :deep(label){
    color: var(--color0);
    font-size: 0.8em;
}

.type1 :deep(label) {
    color: var(--color1);
    font-size: 0.8em;
}

.type2 :deep(label) {
    color: var(--color2);
    font-size: 0.8em;
}

.type3 :deep(label) {
    color: var(--color3);
    font-size: 0.8em;
}

.type4 :deep(label) {
    color: var(--color4);
    font-size: 0.8em;
}

.type5 :deep(label) {
    color: var(--color5);
    font-size: 0.8em;
}

.type6 :deep(label) {
    color: var(--color6);
    font-size: 0.8em;
}

.type7 :deep(label) {
    color: var(--color7);
    font-size: 0.8em;
}

.type8 :deep(label) {
    color: var(--color8);
    font-size: 0.8em;
}

.type9 :deep(label) {
    color: var(--color9);
    font-size: 0.8em;
}

.type10 :deep(label) {
    color: var(--color10);
    font-size: 0.8em;
}

.type11 :deep(label) {
    color: var(--color11);
    font-size: 0.8em;
}

.type12 :deep(label) {
    color: var(--color12);
    font-size: 0.8em;
}

.type13 :deep(label) {
    color: var(--color13);
    font-size: 0.8em;
}

.type14 :deep(label) {
    color: var(--color14);
    font-size: 0.8em;
}




html {
  height: 100%;
  margin: 0;
  padding: 0;
  background-color: #000;
  overflow: hidden;

  ::-webkit-scrollbar {
    // display: none;
  }
  
  -ms-overflow-style: none;
  // scrollbar-width: none;
}

body {
  position: fixed;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;

  font-family: Verdana, Arial, Helvetica, sans-serif;
}

#main-content {
  position: fixed;
  width: 100%;
  height: var(--app-content-height);
  overflow: hidden;

  transition: height 0.1s ease-in-out;
}

#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;

  .wwtelescope-component {
    position: absolute;
    top: 0;
    width: 100%;
    height: 100%;
    border-style: none;
    border-width: 0;
    margin: 0;
    padding: 0;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}

.modal {
  position: absolute;
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  z-index: 100;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}

#modal-loading {
  background-color: #000;
  .container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    .spinner {
      background-image: url("./assets/lunar_loader.gif");
      background-repeat: no-repeat;
      background-size: contain;
      width: 3rem;
      height: 3rem;
    }
    p {
      margin: 0 0 0 1rem;
      padding: 0;
      font-size: 150%;
    }
  }
}





// This prevents the tabs from having some extra space to the left when the screen is small
// (around 400px or less)
.v-tabs:not(.v-tabs--vertical).v-tabs--right>.v-slide-group--is-overflowing.v-tabs-bar--is-mobile:not(.v-slide-group--has-affixes) .v-slide-group__next, .v-tabs:not(.v-tabs--vertical):not(.v-tabs--right)>.v-slide-group--is-overflowing.v-tabs-bar--is-mobile:not(.v-slide-group--has-affixes) .v-slide-group__prev {
  display: none;
}

/* // Styling the slider

#sliderlabel {
  padding: 5px 10px;
  margin:0 5px;
  color:#fff !important;
  background-color: rgba(214, 4, 147,0.7);
  overflow: visible;
}

#slider {
  width: 100% !important;
  margin: 5px 30px;
}

.vue-slider-process {
  background-color: white !important;
}

.vue-slider-dot-tooltip-inner {
  cursor: grab;
  padding: 4px 10px !important;
  color: white !important;
  background-color: #9A2976 !important;
  border: 1px solid #9A2976 !important;

  &:active {
    cursor: grabbing;
  }
}

.vue-slider-dot-handle {
  cursor: grab;
  background-color: #9A2976 !important;
  border: 1px solid black !important;

  &:active {
    cursor: grabbing;
  }
} */

/* .mark-line {
  position: absolute;
  height: 20px;
  width: 2px;
  margin: 0;
  background-color: var(--color-default);
  transform: translateX(-50%) translateY(calc(-50% + 2px));

} */



@media(max-width: 600px) {
  .mark-line {
    display: none;
  }

  #video-container {
    display: inherit;
  }
}


#splash-overlay {
  position: fixed;
  //  vue components are flex, so we can easy center
  align-items: center;
  justify-content: center;
}


#splash-screen {
  // for some reason the view props don't work
  // for max-width and max-height
  // splash image size 1908 × 2040 px
  max-width: calc(min(90vw,1908px)); 
  max-height: calc(min(90vh,2040px)); 
  /* prevent the image from being stretched */
  object-fit: contain;
}

#splash-close {
  // outline: 1px solid rgba(255, 255, 255, 0.094);
  position: absolute;
  width: 7%;
  height: 8%;
  top: 4%;
  left: 84%;

  &:hover {
    cursor: pointer;
  }
}

#overlays {
  margin: 5px;
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
}

ul.text-list {
  margin-left:1em;
  margin-top: 0.5em;
}

div.credits {
  font-size: 0.8em;
}

// For styling the time picker
// See more info here:
// https://vue3datepicker.com/customization/theming/

* {
  --v-input-control-height: 40px;
}


/* from https://www.smashingmagazine.com/2021/12/create-custom-range-input-consistent-browsers/ */
input[type="range"] {
    -webkit-appearance: inherit;
    -moz-appearance: inherit;
    appearance: inherit;
    margin: 2px;
    --track-height: 1em;
    --thumb-radius: 1.5em;
    --thumb-color: rgb(227, 227, 227);
    // --thumb-color: #444;
    --track-color: rgba(4, 147, 214, .1);
    // --thumb-border: 1px solid #899499;
    --thumb-border-width: 1px;
    --thumb-border: var(--thumb-border-width) solid rgb(227, 227, 227);
    --track-border-width: 1px;
    --track-border: var(--track-border-width) solid rgb(227, 227, 227);
    --thumb-margin-top: calc((var(--track-height) - 2*var(--track-border-width)) / 2 - (var(--thumb-radius)) / 2);
    
    &:hover {
      opacity: 1;
      --track-color: rgba(217, 234, 242,0.2);
      --thumb-color: rgb(227, 227, 227);
    }

    &:focus {
      border-radius: calc(var(--track-height) / 2);
    }
  }
  
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: inherit;
    -moz-appearance: inherit;
    appearance: inherit;
    width: var(--thumb-radius);
    height: var(--thumb-radius);
    margin-top: var(--thumb-margin-top);
    border-radius: 50%;
    background: var(--thumb-color);
    border: var(--thumb-border);
  }
  
  input[type="range"]::-moz-range-thumb {
    -webkit-appearance: inherit;
    -moz-appearance: inherit;
    appearance: inherit;
    width: var(--thumb-radius);
    height: var(--thumb-radius);
    margin-top: var(--thumb-margin-top);
    border-radius: 50%;
    background: var(--thumb-color);
    cursor: pointer;
    border: var(--thumb-border)
  }
  
  input[type="range"]::-webkit-slider-runnable-track {
    background: var(--track-color);
    /* outline: 1px solid white; */
    border-radius: calc(var(--track-height) / 2);
    border: var(--track-border);
    height: var(--track-height);
    margin-top: 0;
    padding: 0 calc((var(--track-height) - var(--thumb-radius))/2);
  }
  
  
input[type="range"]::-moz-range-track {
    background: var(--track-color);
    /* outline: 1px solid white; */
    border-radius: calc(var(--track-height) / 2);
    border: var(--track-border);
    height:var(--track-height);
    margin-top: 0;
    padding: 0 calc((var(--track-height) - var(--thumb-radius))/2);
  }

</style>
