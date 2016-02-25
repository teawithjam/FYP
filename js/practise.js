/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = null;
var analyser = null;
var theBuffer = null;
var mediaStreamSource = null;
var detectorElem,
	canvasElem,
	pitchElem,
	noteElem,
	detuneElem,
	detuneAmount;
var maxPitch;
var minPitch;
var interval;
var centsPerHz;
var absoluteHz;



var canvas, ctx, stave, renderer;

window.onload = function() {

	canvas = $("div.test canvas")[0];
	  renderer = new Vex.Flow.Renderer(canvas,
	    Vex.Flow.Renderer.Backends.CANVAS);

	  ctx = renderer.getContext();
	  stave = new Vex.Flow.Stave(10, 0, 500);
	  stave.addClef("treble").setContext(ctx).draw();

		var notes = [
  /*  // Dotted eighth E##
    new Vex.Flow.StaveNote({ keys: ["e##/5"], duration: "8d" }).
      addAccidental(0, new Vex.Flow.Accidental("##")).addDotToAll(),

    // Sixteenth Eb
    new Vex.Flow.StaveNote({ keys: ["eb/5"], duration: "16" }).
      addAccidental(0, new Vex.Flow.Accidental("b")),

    // Half D
    new Vex.Flow.StaveNote({ keys: ["d/5"], duration: "h" }),

    // Quarter Cm#5
    new Vex.Flow.StaveNote({ keys: ["c/5", "eb/5", "g#/5"], duration: "q" }).
      addAccidental(1, new Vex.Flow.Accidental("b")).
      addAccidental(2, new Vex.Flow.Accidental("#"))*/


  ];

  // Helper function to justify and draw a 4/4 voice
  Vex.Flow.Formatter.FormatAndDraw(ctx, stave, notes);

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	var stave = new Vex.Flow.Stave(10, 0, 500);
	stave.addClef("treble").setContext(ctx).draw();

	var notes = [
	// note displayed when no sound is there A4
	new Vex.Flow.StaveNote({ keys: ["a/4"], duration: "q" })
		//addAccidental(0, new Vex.Flow.Accidental("#")).addDotToAll(),
];

// Helper function to justify and draw a 4/4 voice
Vex.Flow.Formatter.FormatAndDraw(ctx, stave, notes);
// end of stave stuff

	audioContext = new AudioContext();
	MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));	// corresponds to a 5kHz signal
	var request = new XMLHttpRequest();

	detectorElem = document.getElementById( "detector" );
	canvasElem = document.getElementById( "output" );

	pitchElem = document.getElementById( "pitch" );
	noteElem = document.getElementById( "note" );
	detuneElem = document.getElementById( "detune" );
	detuneAmount = document.getElementById( "detune_amt" );

	getUserMedia(
		{
					"audio": {
							"mandatory": {
									"googEchoCancellation": "false",
									"googAutoGainControl": "false",
									"googNoiseSuppression": "false",
									"googHighpassFilter": "false"
							},
							"optional": []
					},
			}, gotStream);
}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia =
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

function gotStream(stream) {
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
		var biquadFilter = audioContext.createBiquadFilter();
		biquadFilter.type = 'lowpass';
		//biquadFilter.pitch; //reference mozilla web audio api
		biquadFilter.frequency.value = 1050;
    mediaStreamSource.connect(biquadFilter);
		// Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    biquadFilter.connect( analyser );
    updatePitch();
}

var rafID = null;
var tracks = null;
var buflen = 1024;
var buf = new Float32Array( buflen );

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
	var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
	return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
	return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
	return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

function centsPerHz(){
	if (minPitch === 196){
		var centsPerHz = 50 / (maxPitch - minPitch);

	} else {
	var centsPerHz = 100 / (maxPitch - minPitch);
}
	return centsPerHz;
}


var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.

function autoCorrelate( buf, sampleRate ) {
	var SIZE = buf.length;
	var MAX_SAMPLES = Math.floor(SIZE/2);
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;
	var correlations = new Array(MAX_SAMPLES);

	for (var i=0;i<SIZE;i++) {
		var val = buf[i];
		rms += val*val;
	}
	rms = Math.sqrt(rms/SIZE);
	if (rms<0.01) // not enough signal
		return -1;

	var lastCorrelation=1;
	for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<MAX_SAMPLES; i++) {
			correlation += Math.abs((buf[i])-(buf[i+offset]));
		}
		correlation = 1 - (correlation/MAX_SAMPLES);
		correlations[offset] = correlation; // store it, for the tweaking we need to do below.
		if ((correlation>0.9) && (correlation > lastCorrelation)) {
			foundGoodCorrelation = true;
			if (correlation > best_correlation) {
				best_correlation = correlation;
				best_offset = offset;
			}
		} else if (foundGoodCorrelation) {
			// short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
			// Now we need to tweak the offset - by interpolating between the values to the left and right of the
			// best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
			// we need to do a curve fit on correlations[] around best_offset in order to better determine precise
			// (anti-aliased) offset.

			// we know best_offset >=1,
			// since foundGoodCorrelation cannot go to true until the second pass (offset=1), and
			// we can't drop into this clause until the following pass (else if).
			var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];
			return sampleRate/(best_offset+(8*shift));
		}
		lastCorrelation = correlation;
	}
	if (best_correlation > 0.01) { // increase number value to get less false positive recognition
		// console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
		return sampleRate/best_offset;
	}
	return -1;
//	var best_frequency = sampleRate/best_offset;
}

function updatePitch( time ) {
	var cycles = new Array;
	analyser.getFloatTimeDomainData( buf );
	var ac = autoCorrelate( buf, audioContext.sampleRate );
	// TODO: Paint confidence meter on canvasElem here.

 	if (ac == -1) {
 		detectorElem.className = "vague";
	 	pitchElem.innerText = "--";
		noteElem.innerText = "-";
		detuneElem.className = "";
		detuneAmount.innerText = "--";
 	} else {
	 	detectorElem.className = "confident";
	 	pitch = ac;
	 	pitchElem.innerText = Math.round( pitch ) ;
	 	var note =  noteFromPitch( pitch );
		var pitch = Math.round(pitch);
		var octave ='/4';
		if (pitch >= 220 && pitch<= 440){
			octave = "/3";
		}
		else if (pitch >= 440 && pitch<= 880){
			octave = "/4";
		}
		else if (pitch >= 880 && pitch <= 1760){
			octave = "/5";
		}
		else if (pitch < 220){
			new Vex.Flow.StaveNote({ keys: ["g/3"], duration: "q" })
		}
		else if (pitch > 1760){
			new Vex.Flow.StaveNote({ keys: ["b/5"], duration: "q" })
		}

if (pitch) { //to use for the long method
		//if (pitch >= 197 && pitch <= 1017){
				noteElem.innerHTML = noteStrings[note%12];
        //console.log(noteStrings[note%12][1]);
		} else {
			noteElem.innerHTML = "--";
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		var stave = new Vex.Flow.Stave(10, 0, 500);
		stave.addClef("treble").setContext(ctx).draw();
		// The moving note if you want to play a g#, it adds a sharp to the stave
		// not used to say that the g# is sharp
    if (noteStrings[note%12][1] == undefined) {
      var notes = [
        new Vex.Flow.StaveNote({ keys: [noteStrings[note%12] + octave], duration: "q" })
      ];
    } else if (noteStrings[note%12][1] == "#") {
      var notes = [
        new Vex.Flow.StaveNote({ keys: [noteStrings[note%12] + octave], duration: "q" }).
  			   addAccidental(0, new Vex.Flow.Accidental("#"))
      ];
    } else {
      var notes = [
        new Vex.Flow.StaveNote({ keys: [noteStrings[note%12] + octave], duration: "q" }).
  			   addAccidental(0, new Vex.Flow.Accidental("b")) //This should never happen
      ];
    }
		var detune = centsOffFromPitch( pitch, note ); //KEEP FOREVER
		var colour = getColour(detune);
		notes[0].setStyle({strokeStyle: colour, fillStyle: colour});

	// Helper function to justify and draw a 4/4 voice
	Vex.Flow.Formatter.FormatAndDraw(ctx, stave, notes);


//note detection
  //Long way of separating frequencies to identify the notes
	// It has been done like this because the coder understands this way and not the shorter method commented above

		if (pitch >= 196 && pitch <= 202 || pitch >= 381 && pitch <= 404 || pitch >= 762 && pitch <= 807 ) {
			noteElem.innerHTML = "G";
		}
		if (pitch >= 202 && pitch <= 214 || pitch >= 404 && pitch <= 428 || pitch >= 807 && pitch <= 855 ) {
			noteElem.innerHTML = "G#/A&#9837";
		}
		if (pitch >= 214 && pitch <= 227 || pitch >= 428 && pitch <= 453 || pitch >= 855 && pitch <= 906 ) {
			noteElem.innerHTML = "A";
		}
		if (pitch >= 227 && pitch <= 240 || pitch >= 453 && pitch <= 480 || pitch >= 906 && pitch <= 960 ) {
			noteElem.innerHTML = "A#/B&#9837";
		}
		if (pitch >= 240 && pitch <= 254 || pitch >= 480 && pitch <= 509 || pitch >= 960 && pitch <= 1017 ) {
			noteElem.innerHTML = "B";
		}
		if (pitch >= 254 && pitch <= 269 || pitch >= 509 && pitch <= 539) {
			noteElem.innerHTML = "C";
		}
		if (pitch >= 269 && pitch <= 285 || pitch >= 539 && pitch <= 571) {
			noteElem.innerHTML = "C#/D&#9837";
		}
		if (pitch >= 285 && pitch <= 302 || pitch >= 571 && pitch <= 605) {
			noteElem.innerHTML = "D";
		}
		if (pitch >= 302 && pitch <= 320 || pitch >= 605 && pitch <= 641) {
			noteElem.innerHTML = "D#/E&#9837";
		}
		if (pitch >= 320 && pitch <= 339 || pitch >= 641 && pitch <= 679) {
			noteElem.innerHTML = "E";
		}
		if (pitch >= 339 && pitch <= 360 || pitch >= 679 && pitch <= 719) {
			noteElem.innerHTML = "F";
		}
		if (pitch >= 360 && pitch <= 381 || pitch >= 719 && pitch <= 762) {
			noteElem.innerHTML = "F#/G&#9837";
		}
		console.log(pitch)
	}

		if (detune == 0 ) {
			detuneElem.className = "";
			detuneAmount.innerHTML = "--";
		} else {
			if (detune < 0)
			{
				detuneElem.className = "flat";
				$('.note').addClass('flatColour');
				//make the colour in the box go red
			//	console.log(detune);
			}
			else if (detune > 0)
			{
				detuneElem.className = "sharp";
				$('.note').addClass('sharpColour');
				// make the colour in the box go green
			//	console.log(detune);
			detuneAmount.innerHTML = Math.abs( detune );
			}
		} 			//console.log(detune);
//getColour(detune);

function actualHz (detune){ //not entirely sure this is needed now :/
	var actualHz = absoluteHz + (detune / centsPerHz);
	return actualHz;
}


	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}

function getColour(detune){
	span = $('span'),
	val = parseInt(detune + 50); //detune is values between -50 & 50. adding 50 to it makes the values between 0 & 100
															// to make this function easier to use and understand.
	if (val > 100) {
		val = 100;
	}
	else if (val < 0) {
		val = 1;
	}
	if (val >= 45 && val <= 55){
		span.css({
			color: "rgb(255,255,0)"
		});
	} else {
		if (val < 45) {
			//var perc = (val / 45) * 100; // percentage of va e.g if val = 9 -> (9/45) * 100 = 20% of 45
			var col = (255 / 45);   // 5.666666667
			var r = 255, //Math.floor((255 * (100 - val)) / 100), //(col * val),
					g = (col * val),
					b = 0;
		} else if (val > 55) {
			var x = (val - 55);  // should never be zero
			var col = (255 / 45);
			var y = (x * col);
			var r = (255 - y), //((col * val) * -1),
					g = 255,
					b = 0;
		}
		console.log('r' + r + ' ' + 'g' + g + ' ' + 'b' + b)
	span.css({
		color: "rgb(" + r + "," + g + "," + b + ")"
	}); }
	return "rgb(" + r + "," + g + "," + b + ")";
}
