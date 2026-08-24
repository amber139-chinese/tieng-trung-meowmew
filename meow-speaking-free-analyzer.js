
(function(global){
'use strict';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{
  if(!a.length)return null;
  const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);
  return b.length%2?b[m]:(b[m-1]+b[m])/2;
};
const percentile=(a,q)=>{
  if(!a.length)return null;
  const b=[...a].sort((x,y)=>x-y),p=(b.length-1)*q,l=Math.floor(p),h=Math.ceil(p);
  return l===h?b[l]:b[l]+(b[h]-b[l])*(p-l);
};
const isHan=c=>/[\u3400-\u9FFF\uF900-\uFAFF]/.test(c||'');
const initials=['zh','ch','sh','b','p','m','f','d','t','n','l','g','k','h','j','q','x','r','z','c','s'];

const initTips={
  zh:'Cong nhẹ đầu lưỡi ra sau, tránh đọc gần “z”.',
  ch:'Cong nhẹ đầu lưỡi ra sau và bật hơi rõ hơn.',
  sh:'Cong nhẹ đầu lưỡi ra sau, giữ luồng hơi ma sát đều.',
  r:'Cong nhẹ đầu lưỡi ra sau, tránh đọc thành “z” hoặc “l”.',
  z:'Đầu lưỡi gần chân răng trên, không cong ra sau.',
  c:'Giống “z” nhưng bật hơi rõ hơn.',
  s:'Giữ đầu lưỡi gần chân răng trên, hơi thoát qua khe hẹp.',
  j:'Mặt lưỡi nâng gần ngạc cứng, không cong đầu lưỡi.',
  q:'Giống “j” nhưng bật hơi rõ.',
  x:'Mặt lưỡi nâng gần ngạc cứng, hơi thoát nhẹ.',
  b:'Âm “b” Mandarin ít bật hơi.',
  p:'Âm “p” cần bật hơi rõ hơn “b”.',
  d:'Âm “d” ít bật hơi.',
  t:'Âm “t” cần bật hơi rõ.',
  g:'Âm “g” ít bật hơi và phát ở phía sau khoang miệng.',
  k:'Âm “k” phát phía sau và bật hơi rõ.',
  n:'Cho hơi đi qua mũi, tránh chuyển thành “l”.',
  l:'Đầu lưỡi chạm lợi trên, hơi thoát hai bên lưỡi.',
  f:'Răng trên chạm nhẹ môi dưới, hơi ma sát đi ra.',
  h:'Hơi thoát từ phía sau khoang miệng, đừng đọc quá nặng.',
  m:'Khép môi rõ và cho hơi qua mũi.'
};

const toneTips={
  1:'Thanh 1 nên cao và khá ngang.',
  2:'Thanh 2 cần đi lên rõ từ trung bình lên cao.',
  3:'Thanh 3 cần hạ xuống thấp; trong câu tự nhiên có thể không bật lên nhiều.',
  4:'Thanh 4 cần đi xuống nhanh và dứt khoát.',
  5:'Thanh nhẹ nên ngắn, nhẹ và không nhấn.'
};

function finalTip(f){
  f=String(f||'').replace(/v/g,'ü');
  if(/ang$/.test(f))return 'Giữ miệng mở hơn và kết thúc bằng âm mũi sau “-ng”.';
  if(/eng$/.test(f))return 'Kết thúc bằng “-ng”, phần lưỡi sau nâng rõ hơn.';
  if(/ing$/.test(f))return 'Giữ “i” rõ rồi chuyển sang “-ng”, tránh thành “-in”.';
  if(/ong$/.test(f))return 'Giữ môi tròn và kết thúc bằng “-ng”.';
  if(/an$/.test(f))return 'Kết thúc bằng “-n”, đừng kéo thành “-ng”.';
  if(/en$/.test(f))return 'Kết thúc gọn bằng “-n”.';
  if(/in$/.test(f))return 'Giữ “i” rồi kết thúc “-n”, tránh thành “-ing”.';
  if(f.includes('ü'))return 'Chu môi như “u” nhưng giữ vị trí lưỡi của “i”.';
  if(/ai|ei|ao|ou/.test(f))return 'Đọc liền vận mẫu kép, không tách thành hai âm rời.';
  return 'Giữ khẩu hình ổn định và đọc liền vận mẫu.';
}

function pinyinArray(text,toneType='num'){
  const chars=[...String(text||'')].filter(isHan);
  return chars.map(ch=>{
    try{
      return global.pinyinPro?.pinyin?.(ch,{toneType,type:'array'})?.[0]||'';
    }catch(e){return '';}
  });
}

function parsePinyin(s){
  const raw=String(s||'').toLowerCase().replace(/u:/g,'v').replace(/ü/g,'v');
  const m=raw.match(/([1-5])$/);
  const tone=m?Number(m[1]):5;
  const base=raw.replace(/[1-5]$/,'').replace(/[^a-zv]/g,'');
  const initial=initials.find(x=>base.startsWith(x))||'';
  const final=base.slice(initial.length)||base;
  return {raw,base,tone,initial,final};
}

function expectedInfo(sentence){
  const chars=[...sentence].filter(isHan);
  const nums=pinyinArray(sentence,'num');
  const symbols=pinyinArray(sentence,'symbol');
  const arr=chars.map((char,i)=>({
    char,
    pinyinNum:nums[i]||'',
    pinyinSymbol:symbols[i]||nums[i]||'',
    ...parsePinyin(nums[i]||'')
  }));

  for(let i=0;i<arr.length;i++){
    arr[i].expectedTone=arr[i].tone;
    arr[i].sandhi='';
    const next=arr[i+1]?.tone;

    if(arr[i].char==='不'&&next===4){
      arr[i].expectedTone=2;
      arr[i].sandhi='“不” trước thanh 4 thường đọc thành thanh 2';
    }else if(arr[i].char==='一'&&next){
      if(next===4){
        arr[i].expectedTone=2;
        arr[i].sandhi='“一” trước thanh 4 thường đọc thành thanh 2';
      }else if([1,2,3].includes(next)){
        arr[i].expectedTone=4;
        arr[i].sandhi='“一” trước thanh 1/2/3 thường đọc thành thanh 4';
      }
    }else if(arr[i].tone===3&&next===3){
      arr[i].expectedTone=2;
      arr[i].sandhi='hai thanh 3 liền nhau: âm tiết đầu thường biến thành thanh 2';
    }
  }
  return arr;
}

function align(expected,recognized){
  const a=[...expected].filter(isHan),b=[...recognized].filter(isHan);
  const n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
  for(let i=0;i<=n;i++)dp[i][0]=i;
  for(let j=0;j<=m;j++)dp[0][j]=j;

  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
    const cost=a[i-1]===b[j-1]?0:1;
    dp[i][j]=Math.min(
      dp[i-1][j]+1,
      dp[i][j-1]+1,
      dp[i-1][j-1]+cost
    );
  }

  const pairs=[];
  let i=n,j=m;
  while(i>0||j>0){
    if(i>0&&j>0&&dp[i][j]===dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){
      pairs.push({ei:i-1,ri:j-1,e:a[i-1],r:b[j-1],same:a[i-1]===b[j-1]});
      i--;j--;
    }else if(i>0&&dp[i][j]===dp[i-1][j]+1){
      pairs.push({ei:i-1,ri:null,e:a[i-1],r:'',same:false});
      i--;
    }else{
      pairs.push({ei:null,ri:j-1,e:'',r:b[j-1],same:false});
      j--;
    }
  }

  pairs.reverse();
  const similarity=n?clamp(1-dp[n][m]/Math.max(n,m,1),0,1):0;
  return {pairs,distance:dp[n][m],expected:a,recognized:b,similarity};
}

async function parseWav(blob){
  const ab=await blob.arrayBuffer(),v=new DataView(ab);
  const s4=o=>String.fromCharCode(v.getUint8(o),v.getUint8(o+1),v.getUint8(o+2),v.getUint8(o+3));
  if(s4(0)!=='RIFF'||s4(8)!=='WAVE')throw new Error('WAV không hợp lệ');

  let off=12,sr=16000,ch=1,bits=16,data=-1,size=0;
  while(off+8<=v.byteLength){
    const id=s4(off),len=v.getUint32(off+4,true);
    if(id==='fmt '){
      ch=v.getUint16(off+10,true);
      sr=v.getUint32(off+12,true);
      bits=v.getUint16(off+22,true);
    }
    if(id==='data'){
      data=off+8;
      size=len;
      break;
    }
    off+=8+len+(len%2);
  }

  if(data<0||bits!==16)throw new Error('Cần PCM16 WAV');

  const count=Math.floor(size/2/ch),samples=new Float32Array(count);
  let p=data;
  for(let i=0;i<count;i++){
    let sum=0;
    for(let c=0;c<ch;c++){
      sum+=v.getInt16(p,true)/32768;
      p+=2;
    }
    samples[i]=sum/ch;
  }
  return {samples,sr};
}

function rmsFrames(samples,sr){
  const frame=Math.round(sr*.02),hop=Math.round(sr*.01),out=[];
  for(let s=0;s+frame<=samples.length;s+=hop){
    let e=0;
    for(let i=s;i<s+frame;i++){const x=samples[i];e+=x*x;}
    out.push({t:(s+frame/2)/sr*1000,rms:Math.sqrt(e/frame),sample:s});
  }
  return out;
}

function detectSpeech(frames,totalMs){
  const vals=frames.map(x=>x.rms);
  const noise=percentile(vals,.2)||.0025;
  const hi=percentile(vals,.95)||.02;
  const threshold=Math.max(.010,noise*3.2,hi*.18);

  const raw=frames.map((f,i)=>f.rms>threshold?i:-1).filter(i=>i>=0);
  if(!raw.length){
    return {
      hasSpeech:false,start:0,end:0,threshold,
      voicedMs:0,voicedRatio:0,peakRms:hi,totalMs
    };
  }

  const start=frames[raw[0]].t;
  const end=frames[raw.at(-1)].t;
  const voicedMs=raw.length*10;
  const spanMs=Math.max(1,end-start);
  const voicedRatio=clamp(voicedMs/spanMs,0,1);

  return {
    hasSpeech:true,start,end,threshold,
    voicedMs,voicedRatio,peakRms:hi,totalMs
  };
}

function syllableSegments(frames,start,end,n,threshold){
  if(n<=0||end<=start)return [];
  const relevant=frames.filter(f=>f.t>=start&&f.t<=end);
  if(!relevant.length)return [];

  const boundaries=[start];
  const total=end-start;

  for(let k=1;k<n;k++){
    const target=start+total*k/n;
    const radius=Math.max(80,total/n*.32);
    const candidates=relevant.filter(f=>Math.abs(f.t-target)<=radius);
    let best=target,bestScore=Infinity;

    for(const f of candidates){
      const score=f.rms + Math.abs(f.t-target)/radius*(threshold*.4);
      if(score<bestScore){
        bestScore=score;
        best=f.t;
      }
    }
    boundaries.push(best);
  }

  boundaries.push(end);
  boundaries.sort((a,b)=>a-b);

  return Array.from({length:n},(_,i)=>({
    startMs:boundaries[i],
    endMs:boundaries[i+1]
  }));
}

function estimatePitch(frame,sr){
  let mean=0;
  for(const x of frame)mean+=x;
  mean/=frame.length;

  const x=new Float32Array(frame.length);
  let e=0;
  for(let i=0;i<frame.length;i++){
    const w=.5-.5*Math.cos(2*Math.PI*i/(frame.length-1));
    const s=(frame[i]-mean)*w;
    x[i]=s;
    e+=s*s;
  }

  const rms=Math.sqrt(e/frame.length);
  if(rms<.008)return null;

  const minLag=Math.floor(sr/450);
  const maxLag=Math.min(Math.floor(sr/70),frame.length-3);
  let best=-1,bestLag=0;

  for(let lag=minLag;lag<=maxLag;lag++){
    let num=0,e1=0,e2=0,n=frame.length-lag;
    for(let i=0;i<n;i++){
      const a=x[i],b=x[i+lag];
      num+=a*b;
      e1+=a*a;
      e2+=b*b;
    }
    const corr=num/(Math.sqrt(e1*e2)+1e-12);
    if(corr>best){
      best=corr;
      bestLag=lag;
    }
  }

  if(best<.52||!bestLag)return null;
  return {hz:sr/bestLag,confidence:best};
}

function pitchTrack(samples,sr){
  const frame=Math.round(sr*.04),hop=Math.round(sr*.016),out=[];
  for(let s=0;s+frame<=samples.length;s+=hop){
    const p=estimatePitch(samples.subarray(s,s+frame),sr);
    if(p&&p.hz>=70&&p.hz<=450){
      out.push({timeMs:(s+frame/2)/sr*1000,...p});
    }
  }
  return out;
}

const semi=(hz,ref)=>12*Math.log2(hz/ref);

function toneMetrics(track,seg,ref){
  const pts=track.filter(p=>
    p.timeMs>=seg.startMs+15 &&
    p.timeMs<=seg.endMs-15 &&
    p.confidence>.54
  );

  if(pts.length<5)return null;

  const a=pts.map(p=>semi(p.hz,ref));
  const n=a.length;
  const third=Math.max(1,Math.floor(n/3));

  const st=median(a.slice(0,third));
  const mid=median(a.slice(third,Math.max(third+1,2*third)));
  const en=median(a.slice(2*third));

  return {
    start:st,mid,end:en,
    range:percentile(a,.9)-percentile(a,.1),
    confidence:avg(pts.map(p=>p.confidence))
  };
}

function scoreTone(m,t,duration){
  if(!m)return null;

  let s=0;

  if(t===1){
    const slope=Math.abs(m.end-m.start);
    const rangePenalty=Math.max(0,m.range-2.2)*10;
    s=92-slope*22-rangePenalty;
  }else if(t===2){
    const rise=m.end-m.start;
    s=90-Math.abs(rise-3.0)*17;
    if(rise<.8)s-=24;
    if(rise<0)s-=20;
  }else if(t===3){
    const dip=Math.min(m.start,m.end)-m.mid;
    const lowEnough=dip>.45;
    const fallingHalf=m.start-m.end;
    s=lowEnough ? 82+Math.min(12,dip*10) : 58+Math.max(0,fallingHalf)*8;
  }else if(t===4){
    const fall=m.start-m.end;
    s=92-Math.abs(fall-4.0)*15;
    if(fall<1.1)s-=26;
    if(fall<0)s-=20;
  }else{
    s=duration<420?88:duration<620?76:58;
  }

  s-=Math.max(0,.65-(m.confidence||0))*45;
  return clamp(s,15,98);
}

function transcriptDetails(expectedText,recognizedText){
  const expInfo=expectedInfo(expectedText);
  const recChars=[...String(recognizedText||'')].filter(isHan);
  const recNums=pinyinArray(recognizedText,'num');

  const recMap=recChars.map((c,i)=>({
    char:c,
    ...parsePinyin(recNums[i]||'')
  }));

  const al=align(expectedText,recognizedText||'');
  const initialIssues=[],finalIssues=[];
  let initialGood=0,initialTotal=0,finalGood=0,finalTotal=0,matched=0;
  const mapByExpected={};

  for(const pair of al.pairs){
    if(pair.ei==null)continue;

    const e=expInfo[pair.ei];
    const r=pair.ri==null?null:recMap[pair.ri];
    mapByExpected[pair.ei]={pair,e,r};

    if(pair.same){
      matched++;
      if(e.initial){
        initialGood++;
        initialTotal++;
      }
      finalGood++;
      finalTotal++;
      continue;
    }

    if(!r){
      if(e.initial){
        initialTotal++;
        initialIssues.push(
          `${e.char} (${e.pinyinSymbol}) chưa được nhận ra rõ. Thử đọc chậm thanh mẫu “${e.initial}”.`
        );
      }
      finalTotal++;
      finalIssues.push(
        `${e.char} (${e.pinyinSymbol}) chưa được nhận ra rõ; đọc lại cả âm tiết chậm hơn.`
      );
      continue;
    }

    if(e.initial){
      initialTotal++;
      if(e.initial===r.initial){
        initialGood++;
      }else{
        initialIssues.push(
          `${e.char} (${e.pinyinSymbol}) bị nghe gần thành “${r.char}”. Thanh mẫu mong đợi “${e.initial}”, hệ thống nghe gần “${r.initial||'∅'}”. ${initTips[e.initial]||'Đọc riêng âm đầu rồi ghép lại.'}`
        );
      }
    }

    finalTotal++;
    if(e.final===r.final){
      finalGood++;
    }else{
      finalIssues.push(
        `${e.char} (${e.pinyinSymbol}) bị nghe gần thành “${r.char}”. Vận mẫu mong đợi “${e.final.replace(/v/g,'ü')}”, hệ thống nghe gần “${r.final.replace(/v/g,'ü')}”. ${finalTip(e.final)}`
      );
    }
  }

  const completeness=expInfo.length?matched/expInfo.length*100:0;

  // Strict: exact pinyin component match starts from 0, not from 55.
  const initialScore=initialTotal?100*initialGood/initialTotal:null;
  const finalScore=finalTotal?100*finalGood/finalTotal:null;

  return {
    expInfo,al,mapByExpected,
    completeness:clamp(completeness,0,100),
    transcriptSimilarity:al.similarity*100,
    initialScore,
    finalScore,
    initialIssues,
    finalIssues
  };
}

function pauseAnalysis(frames,bounds,threshold,n){
  const rel=frames.filter(f=>f.t>=bounds.start&&f.t<=bounds.end);
  const silent=[];
  let st=null;

  for(const f of rel){
    if(f.rms<threshold*.72){
      if(st==null)st=f.t;
    }else if(st!=null){
      if(f.t-st>160)silent.push({start:st,end:f.t,dur:f.t-st});
      st=null;
    }
  }

  if(st!=null&&bounds.end-st>160){
    silent.push({start:st,end:bounds.end,dur:bounds.end-st});
  }

  const inner=silent.filter(x=>
    x.start>bounds.start+100 &&
    x.end<bounds.end-100
  );

  let score=92;
  const issues=[];

  inner.forEach(x=>{
    if(x.dur>900){
      score-=24;
      issues.push(`Có một khoảng dừng khoảng ${Math.round(x.dur)} ms quá dài giữa câu.`);
    }else if(x.dur>600){
      score-=14;
      issues.push(`Có khoảng nghỉ ${Math.round(x.dur)} ms hơi dài; nếu không có dấu câu thì nên đọc liền hơn.`);
    }else if(x.dur>400){
      score-=6;
    }
  });

  const duration=Math.max(.1,(bounds.end-bounds.start)/1000);
  const cps=n/duration;

  if(cps<1.1){
    score-=20;
    issues.push('Tốc độ quá chậm; thử đọc theo cụm thay vì tách từng chữ.');
  }else if(cps<1.5){
    score-=9;
    issues.push('Tốc độ hơi chậm.');
  }

  if(cps>7.2){
    score-=18;
    issues.push('Tốc độ quá nhanh; chậm lại để thanh điệu rõ hơn.');
  }else if(cps>6.2){
    score-=8;
  }

  return {
    score:clamp(score,20,96),
    issues,
    cps,
    duration,
    silences:inner
  };
}

function invalidResult(reason,message,extra={}){
  return {
    valid:false,
    rankEligible:false,
    invalidReason:reason,
    pronunciation:{
      PronScore:null,
      AccuracyScore:null,
      FluencyScore:null,
      CompletenessScore:null
    },
    words:[],
    summary:{message},
    detailedFeedback:{
      initials:{score:null,message:'Chưa đủ dữ liệu để chấm.',issues:[]},
      finals:{score:null,message:'Chưa đủ dữ liệu để chấm.',issues:[]},
      tones:{score:null,message:'Chưa đủ dữ liệu để chấm.',issues:[]},
      intonation:{score:null,message:'Chưa đủ dữ liệu để chấm.',issues:[]},
      pauses:{score:null,message:'Chưa đủ dữ liệu để chấm.',issues:[]}
    },
    validation:extra
  };
}

async function analyze({wavBlob,sentence,recognizedText=''}) {
  const {samples,sr}=await parseWav(wavBlob);
  const frames=rmsFrames(samples,sr);
  const totalMs=samples.length/sr*1000;
  const speech=detectSpeech(frames,totalMs);
  const exp=expectedInfo(sentence);
  const n=exp.length;

  // ---------- STRICT VALIDATION GATE ----------
  if(!speech.hasSpeech || speech.peakRms<.012){
    return invalidResult(
      'no_speech',
      'Meow Meow chưa nghe thấy giọng đọc đủ rõ. Đọc lại câu mẫu rồi thử ghi âm thêm một lần nha.',
      speech
    );
  }

  const speechMs=Math.max(0,speech.end-speech.start);
  const minSpeechMs=Math.max(550,n*115);

  if(speechMs<minSpeechMs || speech.voicedMs<Math.max(380,n*70)){
    return invalidResult(
      'too_short',
      'Bản ghi quá ngắn so với câu mẫu nên chưa thể chấm. Hãy đọc đủ cả câu rồi thử lại nha.',
      {...speech,minSpeechMs,speechMs}
    );
  }

  if(speech.voicedRatio<.22){
    return invalidResult(
      'too_little_voice',
      'Phần có tiếng nói trong bản ghi quá ít nên chưa thể chấm chính xác.',
      speech
    );
  }

  const cleanRecognized=[...String(recognizedText||'')].filter(isHan).join('');
  let transcript=null;

  // STRICT V3: no Mandarin transcript = no numeric score.
  // We may still have microphone noise / TV / background audio, so do not guess.
  if(!cleanRecognized){
    return invalidResult(
      'no_mandarin_transcript',
      'Meow Meow chưa nghe được câu tiếng Trung rõ ràng. Lần này không chấm điểm và không lưu bảng xếp hạng. Hãy đọc đủ câu mẫu rồi thử lại nha.',
      {
        speechMs:Math.max(0,speech.end-speech.start),
        voicedMs:speech.voicedMs,
        voicedRatio:speech.voicedRatio
      }
    );
  }

  if(cleanRecognized){
    transcript=transcriptDetails(sentence,cleanRecognized);

    // If the browser heard a substantially different sentence, do not award a numeric score.
    if(transcript.transcriptSimilarity<55 || transcript.completeness<50){
      return invalidResult(
        'wrong_sentence',
        `Meow Meow nghe câu này khác khá nhiều so với câu mẫu${cleanRecognized?` (“${cleanRecognized}”)`:''}. Đọc lại đúng câu rồi hãy chấm điểm nha.`,
        {
          transcriptSimilarity:transcript.transcriptSimilarity,
          completeness:transcript.completeness,
          recognizedText:cleanRecognized
        }
      );
    }
  }

  const segments=syllableSegments(
    frames,speech.start,speech.end,n,speech.threshold
  );

  const track=pitchTrack(samples,sr);
  const speechTrack=track.filter(p=>
    p.timeMs>=speech.start &&
    p.timeMs<=speech.end
  );

  if(speechTrack.length<Math.max(8,n*2)){
    return invalidResult(
      'insufficient_pitch',
      'Meow Meow nghe được giọng nhưng chưa bắt được đủ cao độ để chấm thanh điệu. Thử ghi lại ở nơi yên tĩnh và nói rõ hơn nha.',
      {pitchFrames:speechTrack.length,expectedSyllables:n}
    );
  }

  const ref=median(speechTrack.map(x=>x.hz))||180;
  const toneScores=[],toneIssues=[],wordResults=[];
  let toneDetected=0;

  exp.forEach((info,i)=>{
    const seg=segments[i];
    const m=seg?toneMetrics(speechTrack,seg,ref):null;
    const ts=seg?scoreTone(m,info.expectedTone,seg.endMs-seg.startMs):null;

    if(ts!=null){
      toneScores.push(ts);
      toneDetected++;
    }

    if(ts!=null&&ts<68){
      const extra=info.sandhi?` ${info.sandhi}.`:'';
      toneIssues.push(
        `${info.char} (${info.pinyinSymbol}) — thanh ${info.expectedTone}: khoảng ${Math.round(ts)}/100.${extra} ${toneTips[info.expectedTone]}`
      );
    }

    const pair=transcript?.mapByExpected?.[i]?.pair;
    let lexical=null;
    if(transcript){
      lexical=pair?.same?100:pair?.ri==null?0:30;
    }

    let wordScore=null;
    if(ts!=null&&lexical!=null)wordScore=Math.round(ts*.55+lexical*.45);
    else if(ts!=null)wordScore=Math.round(ts);

    wordResults.push({
      word:info.char,
      accuracy:wordScore,
      toneScore:ts,
      pinyin:info.pinyinSymbol
    });
  });

  const toneCoverage=n?toneDetected/n:0;
  const toneAvg=avg(toneScores);

  if(toneCoverage<.5){
    return invalidResult(
      'insufficient_tone_coverage',
      'Bản ghi chưa có đủ dữ liệu cao độ ở phần lớn âm tiết, nên Meow Meow không cho điểm để tránh chấm sai.',
      {toneCoverage,toneDetected,expectedSyllables:n}
    );
  }

  const pause=pauseAnalysis(
    frames,speech,speech.threshold,n
  );

  const pitchSemis=speechTrack.map(p=>semi(p.hz,ref));
  const pitchRange=pitchSemis.length
    ? percentile(pitchSemis,.9)-percentile(pitchSemis,.1)
    : 0;

  let intonationScore=86;
  const intonationIssues=[];

  if(pitchRange<1.6){
    intonationScore-=24;
    intonationIssues.push('Đường giọng quá phẳng. Nghe mẫu rồi bắt chước độ lên xuống của cả câu.');
  }else if(pitchRange<2.5){
    intonationScore-=12;
    intonationIssues.push('Ngữ điệu còn hơi đều.');
  }else if(pitchRange>13){
    intonationScore-=10;
    intonationIssues.push('Độ lên xuống khá mạnh; thử đọc mềm hơn để câu tự nhiên hơn.');
  }

  if(pause.score<65)intonationScore-=8;
  intonationScore=clamp(intonationScore,25,94);

  const hasTranscript=!!transcript;

  // If browser has no transcript, do NOT fabricate initials/finals/completeness.
  const initials={
    score:hasTranscript?transcript.initialScore:null,
    message:hasTranscript
      ? (transcript.initialIssues.length
          ? 'Có vài thanh mẫu hệ thống nghe chưa giống câu chuẩn.'
          : 'Thanh mẫu được nhận ra khá ổn.')
      : 'Trình duyệt chưa trả transcript Mandarin nên Meow Meow không chấm thanh mẫu.',
    issues:hasTranscript?transcript.initialIssues:[]
  };

  const finals={
    score:hasTranscript?transcript.finalScore:null,
    message:hasTranscript
      ? (transcript.finalIssues.length
          ? 'Có vài vận mẫu cần đọc lại chậm hơn.'
          : 'Vận mẫu được nhận ra khá ổn.')
      : 'Trình duyệt chưa trả transcript Mandarin nên Meow Meow không chấm vận mẫu.',
    issues:hasTranscript?transcript.finalIssues:[]
  };

  const tones={
    score:toneAvg,
    message:toneIssues.length
      ? 'Có vài thanh chưa đi đúng hướng cao độ.'
      : 'Thanh điệu của câu này nhìn chung khá ổn.',
    issues:toneIssues
  };

  const intonation={
    score:intonationScore,
    message:intonationIssues.length
      ? 'Ngữ điệu còn một vài điểm cần chỉnh.'
      : 'Ngữ điệu tổng thể khá cân bằng.',
    issues:intonationIssues
  };

  const pauses={
    score:pause.score,
    message:pause.issues.length
      ? 'Nhịp câu có vài khoảng nghỉ hoặc tốc độ cần chỉnh.'
      : 'Ngắt nghỉ và tốc độ nhìn chung ổn.',
    issues:pause.issues
  };

  const completeness=hasTranscript?transcript.completeness:null;
  const lexicalAccuracy=hasTranscript
    ? avg([
        transcript.transcriptSimilarity,
        transcript.initialScore,
        transcript.finalScore
      ].filter(Number.isFinite))
    : null;

  const fluency=clamp(
    pause.score*.72+intonationScore*.28,
    0,100
  );

  let total=null;
  let rankEligible=false;

  // Numeric total only when we have transcript + enough match.
  if(hasTranscript){
    // Tone and sentence match carry most weight.
    total=
      (toneAvg??0)*.35 +
      (lexicalAccuracy??0)*.30 +
      (completeness??0)*.20 +
      fluency*.10 +
      intonationScore*.05;

    // Strong cap: partial/wrong reading cannot hide behind fluency.
    if(completeness<60)total=Math.min(total,49);
    else if(completeness<75)total=Math.min(total,64);

    if(transcript.transcriptSimilarity<60)total=Math.min(total,59);

    total=clamp(total,0,98);

    rankEligible=
      transcript.transcriptSimilarity>=70 &&
      completeness>=80 &&
      toneCoverage>=.65 &&
      speech.voicedRatio>=.25;
  }

  const weak=wordResults
    .filter(x=>Number.isFinite(x.accuracy)&&x.accuracy<68)
    .sort((a,b)=>a.accuracy-b.accuracy);

  let summary='';
  if(!hasTranscript){
    summary='Meow Meow đã phân tích thanh điệu và nhịp câu, nhưng trình duyệt chưa trả transcript Mandarin nên lần này chưa có tổng điểm và chưa lưu ranking.';
  }else if(!rankEligible){
    summary='Lần đọc này chưa đủ điều kiện lên bảng xếp hạng. Đọc lại đủ câu và rõ hơn một lần nữa nha.';
  }else if(weak.length){
    summary=`Meow Meow thấy ${weak.slice(0,3).map(x=>`“${x.word}”`).join(', ')} cần đọc lại trước.`;
  }else if(toneAvg!=null&&toneAvg<75){
    summary='Câu đọc khá đủ, nhưng thanh điệu còn hơi yếu. Ưu tiên sửa những chữ được đánh dấu.';
  }else{
    summary='Câu này khá ổn đó! Điểm hợp lệ và có thể vào bảng xếp hạng.';
  }

  return {
    valid:true,
    rankEligible,
    pronunciation:{
      PronScore:total,
      AccuracyScore:lexicalAccuracy,
      FluencyScore:fluency,
      CompletenessScore:completeness
    },
    words:wordResults,
    summary:{message:summary},
    detailedFeedback:{
      initials,
      finals,
      tones,
      intonation,
      pauses
    },
    transcript:{
      recognizedText:cleanRecognized,
      expectedText:sentence,
      similarity:transcript?.transcriptSimilarity??null
    },
    validation:{
      speechMs,
      voicedMs:speech.voicedMs,
      voicedRatio:speech.voicedRatio,
      toneCoverage,
      transcriptSimilarity:transcript?.transcriptSimilarity??null
    }
  };
}

global.MeowFreePronunciation={analyze};
})(window);
