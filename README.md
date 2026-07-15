# 발효기 클라우드 모니터 서버

발효기 2대(또는 그 이상)의 ESP32가 주기적으로 데이터를 보내면,
하나의 웹페이지에서 모든 발효기 상태를 한눈에 볼 수 있는 서버입니다.

## Render.com 배포 방법

1. 이 폴더(`server.js`, `package.json`)를 GitHub 저장소에 올립니다.
   (Render는 GitHub 연동 배포가 가장 간단합니다.)

2. https://render.com 접속 → 로그인 → **New +** → **Web Service** 선택

3. 방금 올린 GitHub 저장소 선택

4. 설정값 입력:
   - **Name**: 원하는 이름 (예: `fermenter-monitor`) → 이게 나중에 주소가 됩니다
     `https://fermenter-monitor.onrender.com`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (무료 플랜으로 충분)

5. (선택) **Environment Variables**에 `API_KEY` 추가
   - 아무 문자열이나 정해서 넣으세요 (예: `myFermenter2024Key`)
   - 이렇게 하면 아무나 이 주소로 가짜 데이터를 보낼 수 없게 막아줍니다
   - ESP32 코드의 `CLOUD_API_KEY` 값도 여기서 정한 값과 **똑같이** 맞춰야 합니다
   - 설정 안 하면 인증 없이 그냥 열린 상태로 동작합니다 (테스트용으로는 괜찮음)

6. **Create Web Service** 클릭 → 2~3분 후 배포 완료

7. 배포된 주소(`https://이름.onrender.com`)를 ESP32 코드의
   `CLOUD_SERVER` 값에 넣으면 끝입니다.

## 무료 플랜 관련 참고사항

- Render 무료 플랜은 15분간 요청이 없으면 서버가 잠들고,
  다음 요청 시 30~50초 정도 깨어나는 시간이 걸립니다.
- ESP32가 15초마다 데이터를 계속 보내는 구조라서, 실제 운영 중에는
  서버가 계속 깨어있어 이 문제는 거의 발생하지 않습니다.
- 다만 두 발효기를 껐다 켜는 사이 오랫동안 아무도 접속 안 하면
  서버가 잠들 수 있으니, 처음 접속 시 로딩이 좀 오래 걸리면
  기다렸다가 새로고침 해보세요.

## 로컬에서 테스트하는 방법

```bash
npm install
npm start
```

브라우저로 `http://localhost:3000` 접속하면 대시보드가 보입니다.

테스트용 데이터 보내기:
```bash
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{"id":"1","temp1":35.2,"temp2":35.4,"setTemp":36.0,"relay1":true,"relay2":false}'
```
