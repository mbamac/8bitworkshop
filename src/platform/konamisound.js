"use strict";
var KONAMISOUND_PRESETS = [
];

var KonamiSoundPlatform = function(mainElement) {
  var self = this;
  this.__proto__ = new BaseZ80Platform();

  var cpu, ram, rom, membus, iobus;
  var audio, master;
  var video, timer;
  var interruptPending = 0;
  var psgRegister = 0;
  var psg;

  var cpuFrequency = 14318000/8;
  var ioTimerFrequency = 1789750 / 1280;
  var cpuCyclesPerFrame = cpuFrequency/60;
  var cpuCyclesPerTimer = cpuFrequency/ioTimerFrequency;

  this.getPresets = function() {
    return KONAMISOUND_PRESETS;
  }

  this.start = function() {
    ram = new RAM(0x400);
    membus = {
      read: new AddressDecoder([
				[0x0000, 0x3fff, 0x1fff, function(a) { return rom ? rom[a] : null; }],
				[0x4000, 0x5fff, 0x3ff,  function(a) { return ram.mem[a]; }]
			]),
			write: new AddressDecoder([
				[0x4000, 0x5fff, 0x3ff,  function(a,v) { ram.mem[a] = v; }],
				[0x6000, 0x6fff, 0,      function(a,v) { }],
			]),
      isContended: function() { return false; },
    };
    iobus = {
      read: function(addr) {
        if (addr & 0x40) {
          if (psgRegister == 0xf) { // timer
            var bit = (cpu.getTstates() / cpuCyclesPerTimer) & 1;
            return bit << 3;
          }
          return psg.readRegister(psgRegister) & 0xff;
        }
        return 0;
    	},
    	write: function(addr, val) {
        if (addr & 0x80) {
          psgRegister = val & 0xf;
          //console.log('PSG reg', psgRegister);
        }
        if (addr & 0x40) {
          psg.writeRegisterAY(psgRegister, val & 0xff);
          //console.log('PSG write', psgRegister, val);
        }
    	}
    };
    cpu = window.Z80({
  		display: {},
  		memory: membus,
  		ioBus: iobus
  	});
    psg = new PsgDeviceChannel();
    master = new MasterChannel();
    psg.setMode(PsgDeviceChannel.MODE_SIGNED);
    psg.setDevice(PsgDeviceChannel.DEVICE_AY_3_8910);
    master.addChannel(psg);
    audio = new AudioLooper(512);
    audio.setChannel(master);
    //audio = new SampleAudio(psg.sampleRate);
    video = new RasterVideo(mainElement,256,256);
    video.create();
    video.setKeyboardEvents(function(key,code,flags) {
      var intr = (key-49);
      if (intr >= 0 && (flags & 1)) {
        psg.writeRegister(14, intr);
        psg.writeRegister(15, 0x80);
        cpu.setIFF1(1);
        cpu.requestInterrupt(0x38);
        /*
        console.log(cpu.saveState());
        console.log(hex(intr * 8), cpu.getIFF1(), cpu.getIM());
        cpu.runFrame(cpu.getTstates() + 1);
        console.log(cpu.saveState());
        */
      }
    });
    timer = new AnimationTimer(60, function() {
			if (!self.isRunning())
				return;
      var debugCond = self.getDebugCallback();
      var targetTstates = cpu.getTstates() + cpuCyclesPerFrame;
      if (debugCond) {
        while (cpu.getTstates() < targetTstates) {
          if (debugCond && debugCond()) { debugCond = null; }
          cpu.runFrame(cpu.getTstates() + 1);
        }
      } else {
        cpu.runFrame(targetTstates);
      }
    });
  }

  this.loadROM = function(title, data) {
    rom = padBytes(data, 0x4000);
    cpu.reset();
  }

  this.loadState = function(state) {
    cpu.loadState(state.c);
    ram.mem.set(state.b);
  }
  this.saveState = function() {
    return {
      c:self.getCPUState(),
      b:ram.mem.slice(0),
    };
  }
  this.getCPUState = function() {
    return cpu.saveState();
  }

  this.isRunning = function() {
    return timer.isRunning();
  }
  this.pause = function() {
    timer.stop();
    //audio.stop();
  }
  this.resume = function() {
    timer.start();
    audio.activate();
  }
  this.reset = function() {
    cpu.reset();
    if (!this.getDebugCallback()) cpu.setTstates(0); // TODO?
  }
  this.readAddress = function(addr) {
    return membus.read(addr); // TODO?
  }
}

PLATFORMS['konamisound'] = KonamiSoundPlatform;
