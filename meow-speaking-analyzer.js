
(function(global){
  'use strict';

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const avg = arr => arr.length ? arr.reduce((s,x)=>s+x,0) / arr.length : null;
  const median = arr => {
    if(!arr.length) return null;
    const a = [...arr].sort((x,y)=>x-y);
    const m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
  };
  const percentile = (arr, q) => {
    if(!arr.length) return null;
    const a = [...arr].sort((x,y)=>x-y);
    const p = (a.length - 1) * q;
    const lo = Math.floor(p), hi = Math.ceil(p);
    if(lo === hi) return a[lo];
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  };
  const isHan = ch => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch || '');

  const toneNames = {
    1: 'thanh 1',
    2: 'thanh 2',
    3: 'thanh 3',
    4: 'thanh 4',
    5: 'thanh nhẹ'
  };

  const initialTips = {
    zh: 'Cong nhẹ đầu lưỡi ra sau, tránh đọc gần “z”.',
    ch: 'Cong nhẹ đầu lưỡi ra sau và bật hơi rõ hơn.',
    sh: 'Cong nhẹ đầu lưỡi ra sau, giữ luồng hơi ma sát đều.',
    r:  'Cong nhẹ đầu lưỡi ra sau, không đọc thành “z” hay “l”.',
    z:  'Đầu lưỡi gần chân răng trên, không cong lưỡi ra sau.',
    c:  'Giống “z” nhưng cần bật hơi rõ.',
    s:  'Giữ đầu lưỡi gần chân răng trên, hơi đi qua khe hẹp.',
    j:  'Mặt lưỡi nâng gần ngạc cứng, không cong đầu lưỡi.',
    q:  'Giống “j” nhưng cần bật hơi rõ.',
    x:  'Mặt lưỡi nâng gần ngạc cứng, hơi thoát nhẹ và đều.',
    b:  'Âm “b” tiếng Trung gần như không bật hơi mạnh.',
    p:  'Âm “p” cần bật hơi rõ hơn “b”.',
    d:  'Âm “d” ít bật hơi, đầu lưỡi chạm vùng sau răng trên.',
    t:  'Âm “t” cần bật hơi rõ.',
    g:  'Âm “g” ít bật hơi, phát ở phía sau khoang miệng.',
    k:  'Âm “k” phát ở phía sau khoang miệng và bật hơi rõ.',
    n:  'Cho luồng hơi đi qua mũi, tránh chuyển thành “l”.',
    l:  'Đầu lưỡi chạm lợi trên, hơi thoát hai bên lưỡi.',
    f:  'Răng trên chạm nhẹ môi dưới, để hơi ma sát đi ra.',
    h:  'Hơi thoát từ phía sau khoang miệng, không đọc quá giống “kh” tiếng Việt.',
    m:  'Khép môi rõ và cho hơi qua mũi.'
  };

  function finalTip(final){
    const f = final.replace(/v/g,'ü');
    if(/ang$/.test(f)) return 'Giữ miệng mở hơn và kết thúc bằng âm mũi sau “-ng”.';
    if(/eng$/.test(f)) return 'Kết thúc bằng “-ng”, phần lưỡi sau nâng lên rõ hơn.';
    if(/ing$/.test(f)) return 'Giữ “i” rõ rồi chuyển sang âm mũi sau “-ng”.';
    if(/ong$/.test(f)) return 'Giữ môi tròn và kết thúc bằng âm mũi sau “-ng”.';
    if(/an$/.test(f)) return 'Kết thúc bằng “-n”, đừng kéo thành “-ng”.';
    if(/en$/.test(f)) return 'Kết thúc bằng “-n”, giữ âm giữa ngắn và gọn.';
    if(/in$/.test(f)) return 'Giữ “i” rõ rồi kết thúc bằng “-n”, tránh thành “-ing”.';
    if(f.includes('ü')) return 'Chu môi như “u” nhưng đặt lưỡi ở vị trí của “i”.';
    if(f === 'er') return 'Cuộn nhẹ đầu lưỡi về sau ở phần cuối âm.';
    if(/ai|ei|ao|ou/.test(f)) return 'Đọc liền hai phần của vận mẫu, không tách thành hai âm rời.';
    return 'Giữ khẩu hình ổn định và đọc liền toàn bộ vận mẫu.';
  }

  function toneTip(tone){
    if(tone === 1) return 'Giữ cao và khá ngang từ đầu đến cuối.';
    if(tone === 2) return 'Bắt đầu ở mức trung bình rồi đi lên rõ ràng.';
    if(tone === 3) return 'Hạ giọng xuống thấp rồi nhấc lên; trong câu nói tự nhiên có thể chỉ hạ thấp.';
    if(tone === 4) return 'Bắt đầu tương đối cao rồi hạ nhanh, dứt khoát.';
    return 'Đọc nhẹ, ngắn và không nhấn mạnh quá.';
  }

  function stripToneNumber(s){
    return String(s || '')
      .toLowerCase()
      .replace(/u:/g,'v')
      .replace(/ü/g,'v')
      .replace(/[^a-zv0-9]/g,'')
      .replace(/[1-5]$/,'');
  }

  function toneNumber(s){
    const m = String(s || '').match(/([1-5])$/);
    return m ? Number(m[1]) : 5;
  }

  function splitPinyin(syl){
    const base = stripToneNumber(syl);
    const initials = ['zh','ch','sh','b','p','m','f','d','t','n','l','g','k','h','j','q','x','r','z','c','s'];
    const initial = initials.find(x => base.startsWith(x)) || '';
    const final = base.slice(initial.length) || base;
    return { base, initial, final };
  }

  function pinyinForSentence(sentence){
    const chars = [...sentence].filter(isHan);
    let nums = [];
    let symbols = [];

    try{
      if(global.pinyinPro?.pinyin){
        nums = global.pinyinPro.pinyin(sentence,{toneType:'num',type:'array'})
          .filter(x => /[a-zA-ZüÜvV]/.test(String(x)));
        symbols = global.pinyinPro.pinyin(sentence,{toneType:'symbol',type:'array'})
          .filter(x => /[a-zA-ZüÜvVāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(String(x)));
      }
    }catch(e){}

    if(nums.length !== chars.length){
      nums = chars.map(ch => {
        try{
          const x = global.pinyinPro?.pinyin?.(ch,{toneType:'num',type:'array'})?.[0];
          return x || '';
        }catch(e){ return ''; }
      });
    }
    if(symbols.length !== chars.length){
      symbols = chars.map(ch => {
        try{
          const x = global.pinyinPro?.pinyin?.(ch,{toneType:'symbol',type:'array'})?.[0];
          return x || '';
        }catch(e){ return ''; }
      });
    }

    const baseTones = nums.map(toneNumber);
    const expectedTones = [...baseTones];
    const sandhiNotes = Array(chars.length).fill('');

    for(let i=0;i<chars.length;i++){
      const nextTone = baseTones[i+1];
      if(chars[i] === '不' && nextTone === 4){
        expectedTones[i] = 2;
        sandhiNotes[i] = '“不” đứng trước thanh 4 nên thường đọc thành thanh 2';
      }else if(chars[i] === '一' && nextTone){
        if(nextTone === 4){
          expectedTones[i] = 2;
          sandhiNotes[i] = '“一” đứng trước thanh 4 nên thường đọc thành thanh 2';
        }else if([1,2,3].includes(nextTone)){
          expectedTones[i] = 4;
          sandhiNotes[i] = '“一” đứng trước thanh 1/2/3 nên thường đọc thành thanh 4';
        }
      }else if(baseTones[i] === 3 && nextTone === 3){
        expectedTones[i] = 2;
        sandhiNotes[i] = 'hai thanh 3 liền nhau: âm tiết đầu thường biến thành thanh 2';
      }
    }

    return chars.map((ch,i)=>({
      char: ch,
      pinyinNum: nums[i] || '',
      pinyinSymbol: symbols[i] || nums[i] || '',
      lexicalTone: baseTones[i] || 5,
      expectedTone: expectedTones[i] || 5,
      sandhiNote: sandhiNotes[i],
      ...splitPinyin(nums[i] || '')
    }));
  }

  async function parseWav16(blob){
    const ab = await blob.arrayBuffer();
    const v = new DataView(ab);
    const read4 = o => String.fromCharCode(v.getUint8(o),v.getUint8(o+1),v.getUint8(o+2),v.getUint8(o+3));
    if(read4(0) !== 'RIFF' || read4(8) !== 'WAVE') throw new Error('WAV không hợp lệ');

    let offset = 12, sampleRate = 16000, channels = 1, bits = 16, dataOffset = -1, dataSize = 0;
    while(offset + 8 <= v.byteLength){
      const id = read4(offset);
      const size = v.getUint32(offset+4,true);
      if(id === 'fmt '){
        channels = v.getUint16(offset+10,true);
        sampleRate = v.getUint32(offset+12,true);
        bits = v.getUint16(offset+22,true);
      }else if(id === 'data'){
        dataOffset = offset + 8;
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if(dataOffset < 0 || bits !== 16) throw new Error('Chỉ hỗ trợ PCM16 WAV');

    const count = Math.floor(dataSize / 2 / channels);
    const samples = new Float32Array(count);
    let p = dataOffset;
    for(let i=0;i<count;i++){
      let sum = 0;
      for(let c=0;c<channels;c++){
        sum += v.getInt16(p,true) / 32768;
        p += 2;
      }
      samples[i] = sum / channels;
    }
    return {samples,sampleRate};
  }

  function estimatePitch(frame, sr){
    let mean = 0;
    for(let i=0;i<frame.length;i++) mean += frame[i];
    mean /= frame.length;

    let energy = 0;
    const x = new Float32Array(frame.length);
    for(let i=0;i<frame.length;i++){
      const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/(frame.length-1));
      const s = (frame[i]-mean)*w;
      x[i] = s;
      energy += s*s;
    }
    const rms = Math.sqrt(energy/frame.length);
    if(rms < 0.008) return null;

    const minLag = Math.floor(sr/450);
    const maxLag = Math.min(Math.floor(sr/70), frame.length-3);
    let bestLag = 0, best = -1;

    for(let lag=minLag;lag<=maxLag;lag++){
      let num=0,e1=0,e2=0;
      const n=frame.length-lag;
      for(let i=0;i<n;i++){
        const a=x[i],b=x[i+lag];
        num+=a*b;e1+=a*a;e2+=b*b;
      }
      const corr = num / (Math.sqrt(e1*e2)+1e-12);
      if(corr > best){ best=corr; bestLag=lag; }
    }
    if(best < 0.48 || !bestLag) return null;
    return {hz:sr/bestLag,confidence:best,rms};
  }

  function pitchTrack(samples, sr){
    const frameSize = Math.round(sr * 0.04);
    const hop = Math.round(sr * 0.016);
    const out = [];
    for(let start=0; start+frameSize<=samples.length; start+=hop){
      const frame=samples.subarray(start,start+frameSize);
      const p=estimatePitch(frame,sr);
      if(p && p.hz>=70 && p.hz<=450){
        out.push({timeMs:(start+frameSize/2)/sr*1000,...p});
      }
    }
    return out;
  }

  function hzToSemi(hz, refHz){
    return 12*Math.log2(hz/refHz);
  }

  function segmentMetrics(track,startMs,endMs,refHz){
    const pad = Math.max(10,(endMs-startMs)*0.12);
    const pts = track.filter(p=>p.timeMs>=startMs+pad && p.timeMs<=endMs-pad && p.confidence>=0.5);
    if(pts.length<4) return null;
    const semis = pts.map(p=>hzToSemi(p.hz,refHz));
    const n=semis.length;
    const a=semis.slice(0,Math.max(1,Math.floor(n/3)));
    const b=semis.slice(Math.floor(n/3),Math.max(Math.floor(n/3)+1,Math.floor(2*n/3)));
    const c=semis.slice(Math.floor(2*n/3));
    const start=median(a),mid=median(b),end=median(c);
    return {
      start,mid,end,
      rise:end-start,
      fall:start-end,
      dip:Math.min(start,end)-mid,
      range:percentile(semis,.9)-percentile(semis,.1),
      voicedFrames:n,
      meanConfidence:avg(pts.map(x=>x.confidence))
    };
  }

  function toneScore(m,tone,durationMs){
    if(!m) return {score:null,why:'Không đủ tín hiệu giọng để phân tích thanh điệu.'};
    let score=85,why='';
    if(tone===1){
      const slope=Math.abs(m.end-m.start);
      score=100 - slope*18 - Math.max(0,m.range-2.3)*7;
      why=`độ chênh đầu-cuối ${m.rise.toFixed(1)} bán âm`;
    }else if(tone===2){
      const rise=m.end-m.start;
      score=100 - Math.abs(rise-3.2)*13 - Math.max(0,-rise)*22;
      why=`đường giọng ${rise>=0?'đi lên':'đi xuống'} ${Math.abs(rise).toFixed(1)} bán âm`;
    }else if(tone===3){
      const full = 72 + Math.max(0,m.start-m.mid)*10 + Math.max(0,m.end-m.mid)*9;
      const half = 72 + Math.max(0,m.start-m.end)*12;
      score=Math.max(full,half);
      if(m.mid < Math.min(m.start,m.end)-0.7) score += 8;
      score=Math.min(100,score);
      why=`độ hạ giữa ${Math.max(0,Math.min(m.start,m.end)-m.mid).toFixed(1)} bán âm`;
    }else if(tone===4){
      const fall=m.start-m.end;
      score=100 - Math.abs(fall-4.0)*12 - Math.max(0,-fall)*24;
      why=`đường giọng ${fall>=0?'đi xuống':'đi lên'} ${Math.abs(fall).toFixed(1)} bán âm`;
    }else{
      score = durationMs < 420 ? 92 : durationMs < 650 ? 84 : 76;
      why='thanh nhẹ ưu tiên ngắn và không nhấn mạnh';
    }
    score -= Math.max(0,0.62-(m.meanConfidence||0))*40;
    return {score:clamp(score,35,100),why};
  }

  function buildCharSegments(sentence,words){
    const chars=[...sentence].filter(isHan);
    const segments=[];
    let charIndex=0;

    for(let wi=0;wi<(words||[]).length && charIndex<chars.length;wi++){
      const w=words[wi]||{};
      const wordChars=[...String(w.word||'')].filter(isHan);
      const count=Math.max(1,wordChars.length);
      const startMs=Number(w.offset||0)/10000;
      const durMs=Math.max(1,Number(w.duration||0)/10000);

      for(let k=0;k<count && charIndex<chars.length;k++){
        const s=startMs+durMs*k/count;
        const e=startMs+durMs*(k+1)/count;
        segments.push({
          char:chars[charIndex],
          index:charIndex,
          wordIndex:wi,
          startMs:s,
          endMs:e,
          word:w,
        });
        charIndex++;
      }
    }
    return segments;
  }

  function phonemesForSegment(seg){
    const phones=seg.word?.phonemes||[];
    if(!phones.length) return [];
    const timed=phones.filter(p=>Number.isFinite(Number(p.offset)) && Number.isFinite(Number(p.duration)));
    if(timed.length){
      const picked=timed.filter(p=>{
        const mid=(Number(p.offset)+Number(p.duration)/2)/10000;
        return mid>=seg.startMs-25 && mid<=seg.endMs+25;
      });
      if(picked.length) return picked;
    }
    if(seg.word && [...String(seg.word.word||'')].filter(isHan).length<=1) return phones;
    return phones;
  }

  function componentScore(phones,which){
    if(!phones.length) return null;
    if(phones.length===1) return Number(phones[0].accuracy??0);
    const n=phones.length;
    const cut=Math.max(1,Math.round(n*0.35));
    const chosen=which==='initial'?phones.slice(0,cut):phones.slice(cut);
    return avg((chosen.length?chosen:phones).map(p=>Number(p.accuracy??0)));
  }

  function analyzeInitialsFinals(pinyinInfo,segments){
    const initialScores=[],finalScores=[],initialIssues=[],finalIssues=[];
    segments.forEach(seg=>{
      const info=pinyinInfo[seg.index];
      if(!info) return;
      const phones=phonemesForSegment(seg);
      if(!phones.length) return;

      if(info.initial){
        const s=componentScore(phones,'initial');
        if(Number.isFinite(s)){
          initialScores.push(s);
          if(s<72){
            const tip=initialTips[info.initial]||'Đọc chậm riêng âm đầu rồi ghép lại với vận mẫu.';
            initialIssues.push(`${info.char} (${info.pinyinSymbol}) — thanh mẫu “${info.initial}” khoảng ${Math.round(s)}/100. ${tip}`);
          }
        }
      }

      const fs=componentScore(phones,'final');
      if(Number.isFinite(fs)){
        finalScores.push(fs);
        if(fs<72){
          finalIssues.push(`${info.char} (${info.pinyinSymbol}) — vận mẫu “${info.final.replace(/v/g,'ü')}” khoảng ${Math.round(fs)}/100. ${finalTip(info.final)}`);
        }
      }
    });

    const initialAvg=avg(initialScores),finalAvg=avg(finalScores);
    return {
      initials: initialAvg==null ? null : {
        score:clamp(initialAvg,0,100),
        message: initialIssues.length
          ? 'Có vài âm đầu chưa rõ. Luyện riêng thanh mẫu trước rồi ghép lại cả âm tiết sẽ dễ sửa hơn.'
          : 'Thanh mẫu nhìn chung khá rõ trong câu này.',
        issues:initialIssues
      },
      finals: finalAvg==null ? null : {
        score:clamp(finalAvg,0,100),
        message: finalIssues.length
          ? 'Một vài vận mẫu đang kéo điểm xuống. Chú ý khẩu hình và phần kết thúc -n / -ng nếu có.'
          : 'Vận mẫu nhìn chung ổn trong câu này.',
        issues:finalIssues
      }
    };
  }

  function analyzeTones(pinyinInfo,segments,track,refHz){
    const scores=[],issues=[];
    pinyinInfo.forEach((info,i)=>{
      const seg=segments.find(s=>s.index===i);
      if(!seg) return;
      const duration=seg.endMs-seg.startMs;
      const m=segmentMetrics(track,seg.startMs,seg.endMs,refHz);
      const t=toneScore(m,info.expectedTone,duration);
      if(t.score==null) return;
      scores.push(t.score);
      if(t.score<72){
        const sandhi=info.sandhiNote?` (${info.sandhiNote})`:'';
        issues.push(`${info.char} (${info.pinyinSymbol}) — ${toneNames[info.expectedTone]}${sandhi}: ${Math.round(t.score)}/100. ${toneTip(info.expectedTone)}`);
      }
    });
    const s=avg(scores);
    return s==null?null:{
      score:clamp(s,0,100),
      message:issues.length
        ? 'Thanh điệu có chỗ chưa đi đúng hướng cao độ. Meow Meow đánh dấu những âm tiết nên nghe mẫu và đọc lại trước.'
        : 'Đường cao độ của các thanh trong câu này nhìn chung khá ổn.',
      issues
    };
  }

  function wordRanges(sentence,words){
    let cursor=0;
    return (words||[]).map(w=>{
      const token=String(w.word||'');
      let idx=sentence.indexOf(token,cursor);
      if(idx<0){
        const firstHan=[...token].find(isHan);
        idx=firstHan?sentence.indexOf(firstHan,cursor):-1;
      }
      if(idx<0) idx=cursor;
      const end=idx+token.length;
      cursor=end;
      return {start:idx,end,token};
    });
  }

  function analyzePauses(sentence,words,timingGaps){
    const ranges=wordRanges(sentence,words);
    let score=100;
    const issues=[];

    (timingGaps||[]).forEach((g,i)=>{
      const gap=Number(g.gapMs||0);
      const a=ranges[i],b=ranges[i+1];
      const between=(a&&b)?sentence.slice(a.end,b.start):'';
      const strong=/[。！？!?]/.test(between);
      const soft=/[，、；：,;:]/.test(between);

      if(!strong && !soft && gap>700){
        score-=gap>1000?24:15;
        issues.push(`Bạn dừng khoảng ${Math.round(gap)} ms giữa “${g.after}” và “${g.before}”. Chỗ này không có dấu câu nên nên nối liền hơn.`);
      }else if(!strong && !soft && gap>520){
        score-=9;
        issues.push(`Khoảng nghỉ giữa “${g.after}” và “${g.before}” hơi dài (${Math.round(gap)} ms).`);
      }else if(soft && gap<70){
        score-=7;
        issues.push(`Sau “${g.after}” có dấu ngắt nhẹ nhưng bạn gần như đọc liền. Nghỉ rất ngắn một chút sẽ tự nhiên hơn.`);
      }else if(soft && gap>900){
        score-=12;
        issues.push(`Khoảng nghỉ sau “${g.after}” hơi dài (${Math.round(gap)} ms); dấu phẩy chỉ cần nghỉ nhẹ.`);
      }else if(strong && gap<100){
        score-=5;
        issues.push(`Cuối cụm “${g.after}” có dấu câu; có thể nghỉ nhẹ hơn một chút trước phần tiếp theo.`);
      }
    });

    score=clamp(score,45,100);
    return {
      score,
      message:issues.length
        ? 'Nhịp câu có vài chỗ ngắt chưa tự nhiên. Mục tiêu là nối liền trong cùng cụm và chỉ nghỉ rõ ở dấu câu.'
        : 'Nhịp ngắt nghỉ của câu này khá tự nhiên.',
      issues
    };
  }

  function analyzeIntonation(sentence,words,track,refHz,pauseScore){
    if(!track.length || !refHz) return null;
    const semis=track.map(p=>hzToSemi(p.hz,refHz));
    const range=percentile(semis,.9)-percentile(semis,.1);

    let startMs=0,endMs=0;
    if(words?.length){
      startMs=Number(words[0].offset||0)/10000;
      const last=words[words.length-1];
      endMs=(Number(last.offset||0)+Number(last.duration||0))/10000;
    }
    const durationSec=Math.max(.1,(endMs-startMs)/1000);
    const charCount=[...sentence].filter(isHan).length;
    const cps=charCount/durationSec;

    let score=92;
    const issues=[];
    if(range<2.0){
      score-=22;
      issues.push('Đường giọng hơi phẳng. Thử nghe mẫu rồi bắt chước độ lên xuống tự nhiên của cả câu.');
    }else if(range<3.0){
      score-=10;
      issues.push('Ngữ điệu còn hơi đều; có thể nhấn nhẹ từ mang thông tin chính.');
    }else if(range>13){
      score-=10;
      issues.push('Độ lên xuống khá mạnh. Thử đọc mềm hơn để các thanh vẫn rõ nhưng câu không bị “nhảy” quá nhiều.');
    }

    if(cps<1.25){
      score-=14;
      issues.push('Tốc độ đang khá chậm; thử nối các từ thành cụm thay vì đọc từng chữ rời.');
    }else if(cps>6.5){
      score-=10;
      issues.push('Tốc độ khá nhanh; chậm lại một chút để thanh điệu và vận mẫu rõ hơn.');
    }

    if(Number.isFinite(pauseScore) && pauseScore<70) score-=6;
    score=clamp(score,45,100);

    return {
      score,
      message:issues.length
        ? 'Ngữ điệu đang cần chỉnh nhẹ về độ lên xuống hoặc tốc độ. Đây là điểm hỗ trợ, không dùng để thay thế chấm thanh điệu từng âm tiết.'
        : 'Ngữ điệu và tốc độ tổng thể của câu này khá cân bằng.',
      issues
    };
  }

  function overallSummary(detail,words){
    const weakWords=(words||[]).filter(w=>Number(w.accuracy??100)<70).slice(0,3);
    const dims=[
      ['thanh mẫu',detail.initials?.score],
      ['vận mẫu',detail.finals?.score],
      ['thanh điệu',detail.tones?.score],
      ['ngữ điệu',detail.intonation?.score],
      ['ngắt nghỉ',detail.pauses?.score]
    ].filter(x=>Number.isFinite(x[1])).sort((a,b)=>a[1]-b[1]);

    if(weakWords.length){
      const w=weakWords.map(x=>`“${x.word}”`).join(', ');
      if(dims.length && dims[0][1]<72){
        return `Meow Meow nghe thấy ${w} chưa thật chắc. Phần cần ưu tiên sửa trước là ${dims[0][0]}; nghe mẫu rồi đọc lại chậm một lần nha.`;
      }
      return `Meow Meow nghe thấy ${w} chưa thật chắc. Bấm vào từ có màu vàng/đỏ để nghe lại rồi đọc thêm một lần nha.`;
    }
    if(dims.length && dims[0][1]<72){
      return `Cả câu đọc khá đủ, nhưng ${dims[0][0]} còn hơi yếu. Sửa mục đó trước rồi đọc lại cả câu sẽ thấy khác liền.`;
    }
    return 'Câu này khá ổn đó! Giữ nhịp này rồi thử thêm một câu random khác nha.';
  }

  async function analyze({wavBlob,sentence,words,timingGaps}){
    const {samples,sampleRate}=await parseWav16(wavBlob);
    const track=pitchTrack(samples,sampleRate);
    const hz=track.map(x=>x.hz);
    const refHz=median(hz)||180;
    const pinyinInfo=pinyinForSentence(sentence);
    const segments=buildCharSegments(sentence,words||[]);

    const comp=analyzeInitialsFinals(pinyinInfo,segments);
    const tones=analyzeTones(pinyinInfo,segments,track,refHz);
    const pauses=analyzePauses(sentence,words||[],timingGaps||[]);
    const intonation=analyzeIntonation(sentence,words||[],track,refHz,pauses?.score);

    const detailedFeedback={
      initials:comp.initials,
      finals:comp.finals,
      tones,
      intonation,
      pauses
    };

    return {
      detailedFeedback,
      summary:{message:overallSummary(detailedFeedback,words||[])},
      diagnostics:{
        pitchFrames:track.length,
        medianPitchHz:Math.round(refHz),
        analyzedSyllables:segments.length,
        method:'Azure word/phoneme score + local Mandarin F0/timing heuristics'
      },
      note:'Thanh mẫu/vận mẫu dùng điểm phoneme Azure và timing theo âm tiết. Thanh điệu/ngữ điệu dùng phân tích F0 trên bản ghi. Đây là phản hồi luyện tập, không phải kết luận ngữ âm tuyệt đối.'
    };
  }

  global.MeowSpeakingAnalyzer={analyze};
})(window);
